import { BaseGateway } from './base';
import {
  ConnectIpsConfig,
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
import { generateHmacSha256 } from '../utils/crypto';

export class ConnectIpsGateway extends BaseGateway {
  readonly provider: GatewayProvider = 'connectips';
  readonly environment: Environment;
  private readonly merchantId: string;
  private readonly appId: string;
  private readonly appName: string;
  private readonly secretKey: string;
  private readonly defaultReturnUrl?: string;

  private static readonly SANDBOX_PAYMENT_URL =
    'https://uat.connectips.com/connectipswebgw/loginpage';
  private static readonly LIVE_PAYMENT_URL =
    'https://login.connectips.com/connectipswebgw/loginpage';

  private static readonly SANDBOX_VALIDATE_URL =
    'https://uat.connectips.com/connectipswebws/api/creditor/validatetxn';
  private static readonly LIVE_VALIDATE_URL =
    'https://login.connectips.com/connectipswebws/api/creditor/validatetxn';

  constructor(config: ConnectIpsConfig) {
    super();
    this.merchantId = config.merchantId;
    this.appId = config.appId;
    this.appName = config.appName;
    this.secretKey = config.secretKey;
    this.environment = config.environment || 'sandbox';
    this.defaultReturnUrl = config.returnUrl;
  }

  get paymentUrl(): string {
    return this.environment === 'live'
      ? ConnectIpsGateway.LIVE_PAYMENT_URL
      : ConnectIpsGateway.SANDBOX_PAYMENT_URL;
  }

  get validateUrl(): string {
    return this.environment === 'live'
      ? ConnectIpsGateway.LIVE_VALIDATE_URL
      : ConnectIpsGateway.SANDBOX_VALIDATE_URL;
  }

  /**
   * Format date as DD-MM-YYYY required by ConnectIPS.
   */
  private formatDate(date: Date = new Date()): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  /**
   * Generate ConnectIPS digital signature token.
   */
  generateToken(dataToSign: string): string {
    return generateHmacSha256(dataToSign, this.secretKey);
  }

  /**
   * Initiates ConnectIPS transaction and produces signed gateway form fields.
   */
  async initiate(options: PaymentInitOptions): Promise<PaymentInitResult> {
    const amount = Number(options.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Payment amount must be a positive number');
    }

    const returnUrl = options.returnUrl || this.defaultReturnUrl;
    const txnDate = this.formatDate();
    const amountInPaisa = Math.round(amount * 100);
    const remarks = options.remarks || options.orderName || `Order-${options.orderId}`;
    const particulars = options.particulars || `Payment for order ${options.orderId}`;

    // Standard ConnectIPS string to sign format:
    // MERCHANTID={id},APPID={id},APPNAME={name},TXNID={id},TXNDATE={date},TXNCRNCY=NPR,TXNAMT={amt},REFERENCEID={ref},REMARKS={rem},PARTICULARS={part},TOKEN=TOKEN
    const dataToSign = `MERCHANTID=${this.merchantId},APPID=${this.appId},APPNAME=${this.appName},TXNID=${options.orderId},TXNDATE=${txnDate},TXNCRNCY=NPR,TXNAMT=${amountInPaisa},REFERENCEID=${options.orderId},REMARKS=${remarks},PARTICULARS=${particulars},TOKEN=TOKEN`;
    const token = this.generateToken(dataToSign);

    const formFields: Record<string, string> = {
      MERCHANTID: this.merchantId,
      APPID: this.appId,
      APPNAME: this.appName,
      TXNID: options.orderId,
      TXNDATE: txnDate,
      TXNCRNCY: 'NPR',
      TXNAMT: String(amountInPaisa),
      REFERENCEID: options.orderId,
      REMARKS: remarks,
      PARTICULARS: particulars,
      TOKEN: token,
    };

    if (returnUrl) {
      formFields.RETURNURL = returnUrl;
    }

    return {
      gateway: 'connectips',
      orderId: options.orderId,
      amount,
      redirectUrl: this.paymentUrl,
      method: 'POST',
      formFields,
    };
  }

  /**
   * Verifies ConnectIPS transaction callback by querying the NCHL validation API.
   */
  async verify(options: PaymentVerifyOptions): Promise<PaymentVerifyResult> {
    let payload: Record<string, unknown> = {};

    if (typeof options.payload === 'string') {
      try {
        payload = JSON.parse(options.payload);
      } catch {
        payload = { TXNID: options.payload };
      }
    } else if (typeof options.payload === 'object' && options.payload !== null) {
      payload = options.payload;
    }

    const txnId = String(payload['TXNID'] || payload['txnId'] || options.orderId || '');
    const amount = Number(options.amount || 0);
    const amountInPaisa = amount > 0 ? Math.round(amount * 100) : 0;

    if (!txnId) {
      return {
        success: false,
        gateway: 'connectips',
        status: 'FAILED',
        transactionId: '',
        orderId: '',
        amount,
        rawResponse: payload,
        message: 'Missing TXNID in ConnectIPS verification request',
      };
    }

    // String to sign for validation request:
    // MERCHANTID={id},APPID={id},REFERENCEID={ref},TXNAMT={amt},TOKEN=TOKEN
    const validationDataToSign = `MERCHANTID=${this.merchantId},APPID=${this.appId},REFERENCEID=${txnId},TXNAMT=${amountInPaisa},TOKEN=TOKEN`;
    const validationToken = this.generateToken(validationDataToSign);

    try {
      const res = await fetch(this.validateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(`${this.appId}:${this.secretKey}`).toString('base64')}`,
        },
        body: JSON.stringify({
          merchantId: this.merchantId,
          appId: this.appId,
          referenceId: txnId,
          txnAmt: amountInPaisa,
          token: validationToken,
        }),
      });

      if (!res.ok) {
        // Fallback for sandbox mock validation if remote test server is unreachable
        return {
          success: false,
          gateway: 'connectips',
          status: 'FAILED',
          transactionId: '',
          orderId: txnId,
          amount,
          rawResponse: { httpStatus: res.status, statusText: res.statusText },
          message: `ConnectIPS validation failed with status ${res.status}`,
        };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const rawStatus = String(data['status'] || data['statusDesc'] || '').toUpperCase();
      const isSuccess = rawStatus === 'SUCCESS' || rawStatus === 'COMPLETED';
      const status: PaymentStatus = isSuccess ? 'COMPLETED' : 'FAILED';

      return {
        success: isSuccess,
        gateway: 'connectips',
        status,
        transactionId: String(data['bankTxnId'] || data['txnId'] || txnId),
        orderId: txnId,
        amount: Number(data['txnAmt'] || amountInPaisa) / 100,
        rawResponse: data,
        message: isSuccess ? 'ConnectIPS payment verified successfully' : `Payment status: ${rawStatus}`,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        gateway: 'connectips',
        status: 'FAILED',
        transactionId: '',
        orderId: txnId,
        amount,
        rawResponse: { error: errorMsg },
        message: `Network error verifying ConnectIPS transaction: ${errorMsg}`,
      };
    }
  }

  /**
   * Direct status query for ConnectIPS transactions.
   */
  async checkStatus(options: PaymentStatusOptions): Promise<PaymentStatusResult> {
    const verifyRes = await this.verify({
      payload: { TXNID: options.orderId },
      orderId: options.orderId,
      amount: options.amount,
    });

    return {
      gateway: 'connectips',
      status: verifyRes.status,
      transactionId: verifyRes.transactionId,
      orderId: options.orderId,
      amount: verifyRes.amount,
      rawResponse: verifyRes.rawResponse,
    };
  }
}
