import { NepalPay } from './client';
import { GatewayProvider, PaymentVerifyResult } from './types';

export interface NextPaymentHandlerOptions {
  client: NepalPay;
  gateway?: GatewayProvider;
  expectedAmount?: number | ((orderId: string) => Promise<number | undefined> | number | undefined);
  successRedirect?: string | ((result: PaymentVerifyResult) => string);
  failureRedirect?: string | ((result: PaymentVerifyResult) => string);
  onSuccess?: (result: PaymentVerifyResult) => Promise<void> | void;
  onFailure?: (result: PaymentVerifyResult) => Promise<void> | void;
  /**
   * Replay protection: max allowable timestamp divergence in milliseconds (default: 5 minutes)
   */
  maxTimestampDriftMs?: number;
}

/**
 * Detects the Nepali payment gateway from request payload / query keys.
 */
export function detectGatewayFromPayload(payload: Record<string, unknown>): GatewayProvider | undefined {
  if ('data' in payload || 'signed_field_names' in payload) {
    return 'esewa';
  }
  if ('pidx' in payload || 'purchase_order_id' in payload) {
    return 'khalti';
  }
  if ('PRN' in payload || 'UID' in payload || 'DV' in payload) {
    return 'fonepay';
  }
  if ('TXNID' in payload || 'TXNDATE' in payload) {
    return 'connectips';
  }
  if ('TokenId' in payload || ('MerchantCode' in payload && 'RefId' in payload)) {
    return 'imepay';
  }
  return undefined;
}

/**
 * Universal Next.js (App Router / Pages Router) payment callback and webhook handler.
 * Plug directly into `app/api/payment/callback/route.ts`:
 *
 * ```typescript
 * export const GET = createPaymentCallbackHandler({ client: nepalPay, ... });
 * export const POST = createPaymentCallbackHandler({ client: nepalPay, ... });
 * ```
 */
export function createPaymentCallbackHandler(options: NextPaymentHandlerOptions) {
  return async function handleCallback(request: Request): Promise<Response> {
    const payload: Record<string, unknown> = {};

    // 1. Parse URL Search Params
    const url = new URL(request.url);
    url.searchParams.forEach((val, key) => {
      payload[key] = val;
    });

    // 2. Parse Body if present
    if (request.method === 'POST') {
      const contentType = request.headers.get('content-type') || '';
      try {
        if (contentType.includes('application/json')) {
          const jsonBody = await request.json();
          if (typeof jsonBody === 'object' && jsonBody !== null) {
            Object.assign(payload, jsonBody);
          }
        } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
          const formData = await request.formData();
          formData.forEach((val, key) => {
            if (typeof val === 'string') {
              payload[key] = val;
            }
          });
        }
      } catch {
        // If body reading fails, rely on query params
      }
    }

    // 3. Detect or resolve Gateway Provider
    const detectedGateway = options.gateway || detectGatewayFromPayload(payload) || options.client.defaultGateway;
    if (!detectedGateway) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unable to detect Nepali payment gateway from payload.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Resolve Expected Amount if callback provided
    let expectedAmount: number | undefined;
    const orderId = String(payload['orderId'] || payload['transaction_uuid'] || payload['PRN'] || payload['TXNID'] || payload['RefId'] || '');
    if (typeof options.expectedAmount === 'function') {
      expectedAmount = await options.expectedAmount(orderId);
    } else {
      expectedAmount = options.expectedAmount;
    }

    // 5. Verify via NepalPay Unified Engine
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
        message: `Verification exception: ${msg}`,
      };
    }

    // 6. Execute User Hooks
    if (result.success) {
      if (options.onSuccess) {
        await options.onSuccess(result);
      }
      if (options.successRedirect) {
        const redirectUrl =
          typeof options.successRedirect === 'function'
            ? options.successRedirect(result)
            : options.successRedirect;
        return Response.redirect(redirectUrl, 303);
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
        return Response.redirect(redirectUrl, 303);
      }
    }

    // Default: return clean JSON response
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
