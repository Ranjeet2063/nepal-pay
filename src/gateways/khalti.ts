import { BaseGateway } from './base';
import {
  KhaltiConfig,
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

export class KhaltiGateway extends BaseGateway {
  readonly provider: GatewayProvider = 'khalti';
  readonly environment: Environment;
  private readonly secretKey: string;
  private readonly defaultReturnUrl?: string;
  private readonly defaultWebsiteUrl?: string;

  private static readonly SANDBOX_API_URL = 'https://dev.khalti.com/api/v2';
  private static readonly LIVE_API_URL = 'https://khalti.com/api/v2';

  constructor(config: KhaltiConfig) {
    super();
    this.secretKey = config.secretKey;
    this.environment = config.environment || 'sandbox';
    this.defaultReturnUrl = config.returnUrl;
    this.defaultWebsiteUrl = config.websiteUrl || 'https://nepalpay.dev';
  }

  get baseUrl(): string {
    return this.environment === 'live'
      ? KhaltiGateway.LIVE_API_URL
      : KhaltiGateway.SANDBOX_API_URL;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Key ${this.secretKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * Initiates Khalti ePayment V2 by calling /epayment/initiate/ and returning the checkout URL and pidx.
   */
  async initiate(options: PaymentInitOptions): Promise<PaymentInitResult> {
    const amountInRs = Number(options.amount);
    if (isNaN(amountInRs) || amountInRs <= 0) {
      throw new Error('Payment amount must be a positive number');
    }

    // Khalti API requires amount in PAISA (1 NPR = 100 Paisa)
    const amountInPaisa = Math.round(amountInRs * 100);

    const returnUrl = options.returnUrl || this.defaultReturnUrl;
    if (!returnUrl) {
      throw new Error('returnUrl is required for Khalti payment initiation');
    }

    const payload: Record<string, unknown> = {
      return_url: returnUrl,
      website_url: this.defaultWebsiteUrl,
      amount: amountInPaisa,
      purchase_order_id: options.orderId,
      purchase_order_name: options.orderName || `Order #${options.orderId}`,
    };

    if (options.customer) {
      payload['customer_info'] = {
        name: options.customer.name,
        email: options.customer.email,
        phone: options.customer.phone,
      };
    }

    if (options.productDetails && options.productDetails.length > 0) {
      payload['product_details'] = options.productDetails.map((p) => ({
        identity: p.identity,
        name: p.name,
        total_price: Math.round(p.totalPrice * 100),
        quantity: p.quantity,
        unit_price: Math.round(p.unitPrice * 100),
      }));
    }

    const res = await fetch(`${this.baseUrl}/epayment/initiate/`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      const errorMsg =
        data['detail'] ||
        data['message'] ||
        JSON.stringify(data) ||
        'Khalti payment initiation failed';
      throw new Error(`Khalti API Error (${res.status}): ${errorMsg}`);
    }

    const pidx = String(data['pidx']);
    const paymentUrl = String(data['payment_url']);
    const expiresAt = data['expires_at'] ? String(data['expires_at']) : undefined;

    return {
      gateway: 'khalti',
      orderId: options.orderId,
      amount: amountInRs,
      redirectUrl: paymentUrl,
      method: 'GET',
      pidx,
      expiresAt,
    };
  }

  /**
   * Verifies Khalti payment status via /epayment/lookup/ with the pidx.
   */
  async verify(options: PaymentVerifyOptions): Promise<PaymentVerifyResult> {
    let pidx: string;

    if (typeof options.payload === 'string') {
      pidx = options.payload;
    } else if (typeof options.payload === 'object' && options.payload !== null) {
      pidx = String(options.payload['pidx'] || '');
    } else {
      throw new Error('Khalti verify requires pidx or query object containing pidx');
    }

    if (!pidx) {
      throw new Error('Missing pidx in Khalti verification request');
    }

    const res = await fetch(`${this.baseUrl}/epayment/lookup/`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ pidx }),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      return {
        success: false,
        gateway: 'khalti',
        status: 'FAILED',
        transactionId: '',
        orderId: options.orderId || '',
        amount: options.amount || 0,
        rawResponse: data,
        message: `Khalti lookup failed with HTTP ${res.status}`,
      };
    }

    const rawStatus = String(data['status'] || '');
    const transactionId = String(data['transaction_id'] || pidx);
    const amountInRs = Number(data['total_amount'] || 0) / 100;
    const orderId = String(data['purchase_order_id'] || options.orderId || '');

    let status: PaymentStatus = 'FAILED';
    if (rawStatus === 'Completed') {
      status = 'COMPLETED';
    } else if (rawStatus === 'Pending' || rawStatus === 'Initiated') {
      status = 'PENDING';
    } else if (rawStatus === 'Refunded') {
      status = 'REFUNDED';
    } else if (rawStatus === 'Expired' || rawStatus === 'User canceled') {
      status = 'EXPIRED';
    }

    const isAmountMatching =
      options.amount === undefined || Math.abs(options.amount - amountInRs) < 0.01;

    const success = status === 'COMPLETED' && isAmountMatching;

    return {
      success,
      gateway: 'khalti',
      status,
      transactionId,
      orderId,
      amount: amountInRs,
      rawResponse: data,
      message:
        status === 'COMPLETED'
          ? 'Payment verified successfully'
          : `Khalti payment status: ${rawStatus}`,
    };
  }

  /**
   * Status check via lookup API using pidx.
   */
  async checkStatus(options: PaymentStatusOptions): Promise<PaymentStatusResult> {
    if (!options.pidx) {
      throw new Error('Khalti checkStatus requires pidx');
    }

    const verifyResult = await this.verify({
      payload: options.pidx,
      orderId: options.orderId,
      amount: options.amount,
    });

    return {
      gateway: 'khalti',
      status: verifyResult.status,
      transactionId: verifyResult.transactionId,
      orderId: verifyResult.orderId,
      amount: verifyResult.amount,
      rawResponse: verifyResult.rawResponse,
    };
  }
}
