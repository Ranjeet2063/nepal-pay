import {
  GatewayProvider,
  Environment,
  PaymentInitOptions,
  PaymentInitResult,
  PaymentVerifyOptions,
  PaymentVerifyResult,
  PaymentStatusOptions,
  PaymentStatusResult,
} from '../types';

export abstract class BaseGateway {
  abstract readonly provider: GatewayProvider;
  abstract readonly environment: Environment;

  abstract initiate(options: PaymentInitOptions): Promise<PaymentInitResult>;
  abstract verify(options: PaymentVerifyOptions): Promise<PaymentVerifyResult>;
  abstract checkStatus(options: PaymentStatusOptions): Promise<PaymentStatusResult>;
}
