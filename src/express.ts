import { NepalPay } from './client';
import { GatewayProvider, PaymentVerifyResult } from './types';
import { detectGatewayFromPayload } from './next';

export interface ExpressPaymentHandlerOptions {
  client: NepalPay;
  gateway?: GatewayProvider;
  expectedAmount?: number | ((orderId: string) => Promise<number | undefined> | number | undefined);
  successRedirect?: string | ((result: PaymentVerifyResult) => string);
  failureRedirect?: string | ((result: PaymentVerifyResult) => string);
  onSuccess?: (result: PaymentVerifyResult) => Promise<void> | void;
  onFailure?: (result: PaymentVerifyResult) => Promise<void> | void;
}

export interface ExpressRequestLike {
  method?: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  payment?: PaymentVerifyResult;
}

export interface ExpressResponseLike {
  status: (code: number) => ExpressResponseLike;
  json: (data: unknown) => void;
  redirect: (url: string) => void;
}

/**
 * Universal Express.js middleware and callback route handler for Nepal payments.
 *
 * ```typescript
 * app.all('/api/payment/callback', createExpressPaymentHandler({ client: nepalPay, ... }));
 * ```
 */
export function createExpressPaymentHandler(options: ExpressPaymentHandlerOptions) {
  return async function handleExpressCallback(
    req: ExpressRequestLike,
    res: ExpressResponseLike,
    next?: () => void
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      ...(req.query || {}),
      ...(typeof req.body === 'object' && req.body !== null ? req.body : {}),
    };

    const detectedGateway =
      options.gateway || detectGatewayFromPayload(payload) || options.client.defaultGateway;

    if (!detectedGateway) {
      res.status(400).json({
        success: false,
        error: 'Unable to detect Nepali payment gateway from request payload',
      });
      return;
    }

    const orderId = String(
      payload['orderId'] ||
        payload['transaction_uuid'] ||
        payload['PRN'] ||
        payload['TXNID'] ||
        payload['RefId'] ||
        ''
    );

    let expectedAmount: number | undefined;
    if (typeof options.expectedAmount === 'function') {
      expectedAmount = await options.expectedAmount(orderId);
    } else {
      expectedAmount = options.expectedAmount;
    }

    let result: PaymentVerifyResult;
    try {
      result = await options.client.verify(detectedGateway, {
        payload,
        orderId,
        amount: expectedAmount,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result = {
        success: false,
        gateway: detectedGateway,
        status: 'FAILED',
        transactionId: '',
        orderId,
        amount: expectedAmount || 0,
        rawResponse: payload,
        message: `Express verification error: ${msg}`,
      };
    }

    req.payment = result;

    if (result.success) {
      if (options.onSuccess) {
        await options.onSuccess(result);
      }
      if (options.successRedirect) {
        const redirectUrl =
          typeof options.successRedirect === 'function'
            ? options.successRedirect(result)
            : options.successRedirect;
        res.redirect(redirectUrl);
        return;
      }
    } else {
      if (options.onFailure) {
        await options.onFailure(result);
      }
      if (options.failureRedirect) {
        const redirectUrl =
          typeof options.failureRedirect === 'function'
            ? options.failureRedirect(result)
            : options.failureRedirect;
        res.redirect(redirectUrl);
        return;
      }
    }

    if (next && typeof next === 'function') {
      next();
      return;
    }

    res.status(result.success ? 200 : 400).json(result);
  };
}
