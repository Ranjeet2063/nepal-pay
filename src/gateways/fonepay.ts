import { BaseGateway } from './base';
import {
  FonepayConfig,
  Environment,
  GatewayProvider,
  PaymentInitOptions,
  PaymentInitResult,
  PaymentVerifyOptions,
  PaymentVerifyResult,
  PaymentStatusOptions,
  PaymentStatusResult,
  PaymentStatus,
  DynamicQrOptions,
  DynamicQrResult,
} from '../types';
import { generateHmacSha512, calculateCrc16, formatTlv } from '../utils/crypto';

export class FonepayGateway extends BaseGateway {
  readonly provider: GatewayProvider = 'fonepay';
  readonly environment: Environment;
  private readonly merchantCode: string;
  private readonly secretKey: string;
  private readonly defaultReturnUrl?: string;

  private static readonly SANDBOX_URL =
    'https://dev-clientapi.fonepay.com/api/merchantRequest';
  private static readonly LIVE_URL =
    'https://clientapi.fonepay.com/api/merchantRequest';

  constructor(config: FonepayConfig) {
    super();
    this.merchantCode = config.merchantCode;
    this.secretKey = config.secretKey;
    this.environment = config.environment || 'sandbox';
    this.defaultReturnUrl = config.returnUrl;
  }

  get paymentUrl(): string {
    return this.environment === 'live'
      ? FonepayGateway.LIVE_URL
      : FonepayGateway.SANDBOX_URL;
  }

  async initiate(options: PaymentInitOptions): Promise<PaymentInitResult> {
    const amount = Number(options.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Payment amount must be a positive number');
    }

    const returnUrl = options.returnUrl || this.defaultReturnUrl;
    if (!returnUrl) {
      throw new Error('returnUrl is required for Fonepay payment initiation');
    }

    // Fonepay standard checksum string: MD,PRN,PID,CRN,DV
    const dataToHash = `${this.merchantCode},${options.orderId},${amount.toFixed(2)},${returnUrl}`;
    const dv = generateHmacSha512(dataToHash, this.secretKey);

    const formFields: Record<string, string> = {
      PID: this.merchantCode,
      MD: 'P',
      PRN: options.orderId,
      AMT: amount.toFixed(2),
      CRN: 'NPR',
      DT: new Date().toLocaleDateString('en-US'),
      R1: options.orderName || `Order #${options.orderId}`,
      RU: returnUrl,
      DV: dv,
    };

    return {
      gateway: 'fonepay',
      orderId: options.orderId,
      amount,
      redirectUrl: this.paymentUrl,
      method: 'POST',
      formFields,
    };
  }

  async verify(options: PaymentVerifyOptions): Promise<PaymentVerifyResult> {
    const payload = typeof options.payload === 'object' ? options.payload : {};
    const uid = String(payload['UID'] || payload['uid'] || '');
    const prn = String(payload['PRN'] || payload['prn'] || options.orderId || '');
    const dv = String(payload['DV'] || payload['dv'] || '');
    const ps = String(payload['PS'] || payload['ps'] || '').toLowerCase();

    // Verify response checksum if provided
    let isDvValid = true;
    if (dv && uid && prn) {
      const expectedDv = generateHmacSha512(`${this.merchantCode},${prn},${uid}`, this.secretKey);
      isDvValid = expectedDv === dv;
    }

    const isSuccess = isDvValid && (ps === 'yes' || ps === 'true' || ps === 'success');
    const status: PaymentStatus = isSuccess ? 'COMPLETED' : 'FAILED';

    return {
      success: isSuccess,
      gateway: 'fonepay',
      status,
      transactionId: uid,
      orderId: prn,
      amount: options.amount || 0,
      rawResponse: payload as Record<string, unknown>,
      message: isSuccess ? 'Payment verified successfully' : 'Fonepay verification failed',
    };
  }

  async checkStatus(options: PaymentStatusOptions): Promise<PaymentStatusResult> {
    return {
      gateway: 'fonepay',
      status: 'PENDING',
      orderId: options.orderId,
      amount: options.amount || 0,
      rawResponse: { message: 'Direct status check query requires merchant verification key' },
    };
  }

  /**
   * Generates an EMVCo-compliant NepalQR dynamic QR string.
   * Can be scanned by any Nepali banking app (Nabil, Global IME, NIC Asia, eSewa, Khalti).
   */
  generateDynamicQR(options: DynamicQrOptions): DynamicQrResult {
    const amount = Number(options.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Payment amount must be a positive number');
    }

    const merchantCode = options.merchantCode || this.merchantCode;
    const merchantName = options.merchantName || 'NepalPay Merchant';
    const amountStr = amount.toFixed(2);
    const orderId = options.orderId;

    const merchantSubTlv = formatTlv('00', 'NP.FONEPAY.MERCHANT') + formatTlv('01', merchantCode);
    const merchantAccountInfo = formatTlv('26', merchantSubTlv);

    const additionalSubTlv =
      formatTlv('01', orderId) +
      (options.remarks ? formatTlv('05', options.remarks) : '') +
      (options.terminalId ? formatTlv('07', options.terminalId) : '');
    const additionalData = formatTlv('62', additionalSubTlv);

    const merchantCity = options.merchantCity || 'Kathmandu';

    const qrWithoutCrc =
      formatTlv('00', '01') +
      formatTlv('01', '12') +
      merchantAccountInfo +
      formatTlv('52', '5999') +
      formatTlv('53', '524') +
      formatTlv('54', amountStr) +
      formatTlv('58', 'NP') +
      formatTlv('59', merchantName) +
      formatTlv('60', merchantCity) +
      additionalData +
      '6304';

    const crc = calculateCrc16(qrWithoutCrc);
    const finalQrString = qrWithoutCrc + crc;

    return {
      qrString: finalQrString,
      orderId,
      amount,
      currency: 'NPR',
      merchantName,
    };
  }
}
