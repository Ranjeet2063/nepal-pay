import {
  NepalPayConfig,
  GatewayProvider,
  PaymentInitOptions,
  PaymentInitResult,
  PaymentVerifyOptions,
  PaymentVerifyResult,
  PaymentStatusOptions,
  PaymentStatusResult,
} from './types';
import { BaseGateway } from './gateways/base';
import { EsewaGateway } from './gateways/esewa';
import { KhaltiGateway } from './gateways/khalti';
import { FonepayGateway } from './gateways/fonepay';

export interface InitiateRequest extends PaymentInitOptions {
  gateway?: GatewayProvider;
}

export class NepalPay {
  private readonly gateways = new Map<GatewayProvider, BaseGateway>();
  readonly defaultGateway?: GatewayProvider;

  constructor(config: NepalPayConfig) {
    if (config.esewa) {
      this.gateways.set('esewa', new EsewaGateway(config.esewa));
    }
    if (config.khalti) {
      this.gateways.set('khalti', new KhaltiGateway(config.khalti));
    }
    if (config.fonepay) {
      this.gateways.set('fonepay', new FonepayGateway(config.fonepay));
    }

    this.defaultGateway =
      config.defaultGateway ||
      (this.gateways.has('esewa')
        ? 'esewa'
        : this.gateways.has('khalti')
          ? 'khalti'
          : this.gateways.has('fonepay')
            ? 'fonepay'
            : undefined);
  }

  get esewa(): EsewaGateway {
    const gw = this.gateways.get('esewa');
    if (!gw) {
      throw new Error('eSewa gateway is not configured. Pass esewa config to NepalPay constructor.');
    }
    return gw as EsewaGateway;
  }

  get khalti(): KhaltiGateway {
    const gw = this.gateways.get('khalti');
    if (!gw) {
      throw new Error('Khalti gateway is not configured. Pass khalti config to NepalPay constructor.');
    }
    return gw as KhaltiGateway;
  }

  get fonepay(): FonepayGateway {
    const gw = this.gateways.get('fonepay');
    if (!gw) {
      throw new Error('Fonepay gateway is not configured. Pass fonepay config to NepalPay constructor.');
    }
    return gw as FonepayGateway;
  }

  /**
   * Get an initialized gateway by provider name.
   */
  getGateway(provider?: GatewayProvider): BaseGateway {
    const selectedProvider = provider || this.defaultGateway;
    if (!selectedProvider) {
      throw new Error(
        'No gateway specified and no defaultGateway configured in NepalPay.'
      );
    }

    const gateway = this.gateways.get(selectedProvider);
    if (!gateway) {
      throw new Error(
        `Gateway '${selectedProvider}' is not configured in NepalPay.`
      );
    }
    return gateway;
  }

  /**
   * Universal payment initiation across any configured Nepal gateway.
   */
  async initiate(options: InitiateRequest): Promise<PaymentInitResult> {
    const gateway = this.getGateway(options.gateway);
    return gateway.initiate(options);
  }

  /**
   * Universal payment verification across any configured Nepal gateway.
   */
  async verify(
    gatewayOrPayload: GatewayProvider | PaymentVerifyOptions,
    options?: PaymentVerifyOptions
  ): Promise<PaymentVerifyResult> {
    let provider: GatewayProvider;
    let verifyOptions: PaymentVerifyOptions;

    if (typeof gatewayOrPayload === 'string') {
      provider = gatewayOrPayload;
      if (!options) {
        throw new Error('PaymentVerifyOptions must be provided as second argument.');
      }
      verifyOptions = options;
    } else {
      provider = this.defaultGateway!;
      verifyOptions = gatewayOrPayload;
    }

    const gateway = this.getGateway(provider);
    return gateway.verify(verifyOptions);
  }

  /**
   * Universal payment status check across any configured Nepal gateway.
   */
  async checkStatus(
    gateway: GatewayProvider,
    options: PaymentStatusOptions
  ): Promise<PaymentStatusResult> {
    const gw = this.getGateway(gateway);
    return gw.checkStatus(options);
  }
}
