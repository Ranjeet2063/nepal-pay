export type Environment = 'sandbox' | 'live';
export type GatewayProvider = 'esewa' | 'khalti' | 'fonepay';

export type PaymentStatus =
  | 'COMPLETED'
  | 'PENDING'
  | 'FAILED'
  | 'REFUNDED'
  | 'EXPIRED'
  | 'AMBIGUOUS';

export interface CustomerInfo {
  name?: string;
  email?: string;
  phone?: string;
}

export interface ProductItem {
  identity: string;
  name: string;
  totalPrice: number;
  quantity: number;
  unitPrice: number;
}

export interface EsewaConfig {
  merchantCode: string;
  secretKey: string;
  environment?: Environment;
  successUrl?: string;
  failureUrl?: string;
}

export interface KhaltiConfig {
  secretKey: string;
  publicKey?: string;
  environment?: Environment;
  returnUrl?: string;
  websiteUrl?: string;
}

export interface FonepayConfig {
  merchantCode: string;
  secretKey: string;
  environment?: Environment;
  returnUrl?: string;
}

export interface NepalPayConfig {
  esewa?: EsewaConfig;
  khalti?: KhaltiConfig;
  fonepay?: FonepayConfig;
  defaultGateway?: GatewayProvider;
}

export interface PaymentInitOptions {
  amount: number;
  orderId: string;
  orderName?: string;
  customer?: CustomerInfo;
  returnUrl?: string;
  failureUrl?: string;
  metadata?: Record<string, unknown>;
  productDetails?: ProductItem[];

  // eSewa specific optional breakdowns
  taxAmount?: number;
  serviceCharge?: number;
  deliveryCharge?: number;
}

export interface PaymentInitResult {
  gateway: GatewayProvider;
  orderId: string;
  amount: number;
  redirectUrl: string;
  method: 'GET' | 'POST';
  formFields?: Record<string, string>;
  pidx?: string;
  expiresAt?: string;
}

export interface PaymentVerifyOptions {
  /**
   * For eSewa: Base64 encoded 'data' query param or raw decoded object.
   * For Khalti: 'pidx' string or query object containing pidx.
   */
  payload: string | Record<string, unknown>;
  orderId?: string;
  amount?: number;
}

export interface PaymentVerifyResult {
  success: boolean;
  gateway: GatewayProvider;
  status: PaymentStatus;
  transactionId: string;
  orderId: string;
  amount: number;
  rawResponse: Record<string, unknown>;
  message?: string;
}

export interface PaymentStatusOptions {
  orderId: string;
  amount?: number;
  pidx?: string; // Khalti identifier
}

export interface PaymentStatusResult {
  gateway: GatewayProvider;
  status: PaymentStatus;
  transactionId?: string;
  orderId: string;
  amount: number;
  rawResponse: Record<string, unknown>;
}
