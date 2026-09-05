import { BaseGateway } from './base';
import {
  EsewaConfig,
  Environment,
  GatewayProvider,
  PaymentInitOptions,
  PaymentInitResult,
  PaymentVerifyOptions,
  PaymentVerifyResult,
  PaymentStatusOptions,
  PaymentStatusResult,
  PaymentStatus,
} from '../types';
import {
  generateHmacSha256,
  verifyEsewaSignature,
  decodeBase64,
} from '../utils/crypto';

export class EsewaGateway extends BaseGateway {
  readonly provider: GatewayProvider = 'esewa';
  readonly environment: Environment;
  private readonly merchantCode: string;
  private readonly secretKey: string;
  private readonly defaultSuccessUrl?: string;
  private readonly defaultFailureUrl?: string;

  private static readonly SANDBOX_PAYMENT_URL =
    'https://rc-epay.esewa.com.np/api/epay/main/v2/form';
  private static readonly LIVE_PAYMENT_URL =
    'https://epay.esewa.com.np/api/epay/main/v2/form';

  private static readonly SANDBOX_STATUS_URL =
    'https://rc.esewa.com.np/mobile/api/v2/CheckTransactionStatus';
  private static readonly LIVE_STATUS_URL =
    'https://epay.esewa.com.np/api/v2/CheckTransactionStatus';

  constructor(config: EsewaConfig) {
    super();
    this.merchantCode = config.merchantCode || 'EPAYTEST';
    this.secretKey = config.secretKey || '8gBm/:&EnhH.1/q';
    this.environment = config.environment || 'sandbox';
    this.defaultSuccessUrl = config.successUrl;
    this.defaultFailureUrl = config.failureUrl;
  }

  get paymentUrl(): string {
    return this.environment === 'live'
      ? EsewaGateway.LIVE_PAYMENT_URL
      : EsewaGateway.SANDBOX_PAYMENT_URL;
  }

  get statusUrl(): string {
    return this.environment === 'live'
      ? EsewaGateway.LIVE_STATUS_URL
      : EsewaGateway.SANDBOX_STATUS_URL;
  }

  /**
   * Initiates an eSewa V2 payment by generating the required form fields and HMAC-SHA256 signature.
   */
  async initiate(options: PaymentInitOptions): Promise<PaymentInitResult> {
    const amount = Number(options.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Payment amount must be a positive number');
    }

    const taxAmount = Number(options.taxAmount || 0);
    const serviceCharge = Number(options.serviceCharge || 0);
    const deliveryCharge = Number(options.deliveryCharge || 0);
    const totalAmount = amount + taxAmount + serviceCharge + deliveryCharge;

    const successUrl = options.returnUrl || this.defaultSuccessUrl;
    const failureUrl = options.failureUrl || this.defaultFailureUrl;

    if (!successUrl || !failureUrl) {
      throw new Error('Both returnUrl and failureUrl must be provided for eSewa payment');
    }

    const signedFieldNames = 'total_amount,transaction_uuid,product_code';
    const dataToSign = `total_amount=${totalAmount},transaction_uuid=${options.orderId},product_code=${this.merchantCode}`;
    const signature = generateHmacSha256(dataToSign, this.secretKey);

    const formFields: Record<string, string> = {
      amount: String(amount),
      tax_amount: String(taxAmount),
      total_amount: String(totalAmount),
      transaction_uuid: options.orderId,
      product_code: this.merchantCode,
      product_service_charge: String(serviceCharge),
      product_delivery_charge: String(deliveryCharge),
      success_url: successUrl,
      failure_url: failureUrl,
      signed_field_names: signedFieldNames,
      signature: signature,
    };

    return {
      gateway: 'esewa',
      orderId: options.orderId,
      amount: totalAmount,
      redirectUrl: this.paymentUrl,
      method: 'POST',
      formFields,
    };
  }

  /**
   * Verifies the eSewa V2 callback payload.
   * Accepts either the base64 encoded 'data' string from the query param or an already decoded object.
   */
  async verify(options: PaymentVerifyOptions): Promise<PaymentVerifyResult> {
    let payloadData: Record<string, unknown>;

    if (typeof options.payload === 'string') {
      try {
        const decodedJson = decodeBase64(options.payload);
        payloadData = JSON.parse(decodedJson);
      } catch (err) {
        return {
          success: false,
          gateway: 'esewa',
          status: 'FAILED',
          transactionId: '',
          orderId: options.orderId || '',
          amount: options.amount || 0,
          rawResponse: { error: 'Invalid Base64 payload', raw: options.payload },
          message: 'Failed to decode eSewa response payload',
        };
      }
    } else if (typeof options.payload === 'object' && options.payload !== null) {
      // If the object contains a 'data' string property
      if (typeof options.payload['data'] === 'string') {
        try {
          const decodedJson = decodeBase64(options.payload['data']);
          payloadData = JSON.parse(decodedJson);
        } catch {
          payloadData = options.payload;
        }
      } else {
        payloadData = options.payload;
      }
    } else {
      throw new Error('Invalid verification payload supplied');
    }

    const signature = String(payloadData['signature'] || '');
    const isSignatureValid = verifyEsewaSignature(payloadData, signature, this.secretKey);

    const rawStatus = String(payloadData['status'] || '').toUpperCase();
    const orderId = String(payloadData['transaction_uuid'] || options.orderId || '');
    const transactionId = String(payloadData['transaction_code'] || '');
    const returnedAmount = Number(payloadData['total_amount'] || 0);

    let status: PaymentStatus = 'FAILED';
    if (!isSignatureValid) {
      status = 'AMBIGUOUS';
    } else if (rawStatus === 'COMPLETE') {
      status = 'COMPLETED';
    } else if (rawStatus === 'PENDING') {
      status = 'PENDING';
    }

    // If expected amount was provided, cross verify
    const isAmountMatching =
      options.amount === undefined || Math.abs(options.amount - returnedAmount) < 0.01;

    const success = isSignatureValid && status === 'COMPLETED' && isAmountMatching;

    return {
      success,
      gateway: 'esewa',
      status,
      transactionId,
      orderId,
      amount: returnedAmount,
      rawResponse: payloadData,
      message: !isSignatureValid
        ? 'Invalid eSewa signature: potential tampering detected'
        : !isAmountMatching
          ? `Amount mismatch: expected ${options.amount}, received ${returnedAmount}`
          : status === 'COMPLETED'
            ? 'Payment verified successfully'
            : `Payment status: ${status}`,
    };
  }

  /**
   * Queries eSewa transaction status via backend API.
   */
  async checkStatus(options: PaymentStatusOptions): Promise<PaymentStatusResult> {
    const totalAmount = options.amount || 0;
    const url = new URL(this.statusUrl);
    url.searchParams.set('product_code', this.merchantCode);
    url.searchParams.set('total_amount', String(totalAmount));
    url.searchParams.set('transaction_uuid', options.orderId);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return {
        gateway: 'esewa',
        status: 'FAILED',
        orderId: options.orderId,
        amount: totalAmount,
        rawResponse: { httpStatus: res.status, statusText: res.statusText },
      };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const rawStatus = String(data['status'] || '').toUpperCase();

    let status: PaymentStatus = 'FAILED';
    if (rawStatus === 'COMPLETE') status = 'COMPLETED';
    else if (rawStatus === 'PENDING') status = 'PENDING';
    else if (rawStatus === 'NOT_FOUND') status = 'FAILED';

    return {
      gateway: 'esewa',
      status,
      transactionId: data['ref_id'] ? String(data['ref_id']) : undefined,
      orderId: options.orderId,
      amount: Number(data['total_amount'] || totalAmount),
      rawResponse: data,
    };
  }
}
