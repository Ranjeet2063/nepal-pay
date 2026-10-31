import { describe, it, expect } from 'bun:test';
import { NepalPay } from '../src/client';
import { createExpressPaymentHandler } from '../src/express';
import { encodeBase64, generateHmacSha256 } from '../src/utils/crypto';

describe('Express Payment Callback Middleware', () => {
  const secretKey = '8gBm/:&EnhH.1/q';
  const client = new NepalPay({
    esewa: {
      merchantCode: 'EPAYTEST',
      secretKey,
    },
  });

  it('verifies payment payload and populates req.payment', async () => {
    const rawData = {
      transaction_code: 'ESEWA_EXP_001',
      status: 'COMPLETE',
      total_amount: '750',
      transaction_uuid: 'ORDER_EXPRESS_100',
      product_code: 'EPAYTEST',
      signed_field_names: 'total_amount,transaction_uuid,product_code',
    };
    const signature = generateHmacSha256(
      'total_amount=750,transaction_uuid=ORDER_EXPRESS_100,product_code=EPAYTEST',
      secretKey
    );
    const base64Data = encodeBase64(JSON.stringify({ ...rawData, signature }));

    let responseStatusCode = 0;
    let responseJson: unknown = null;
    let hookFired = false;

    const handler = createExpressPaymentHandler({
      client,
      expectedAmount: 750,
      onSuccess: (res) => {
        hookFired = true;
        expect(res.orderId).toBe('ORDER_EXPRESS_100');
      },
    });

    const mockReq: Record<string, unknown> = {
      query: { data: base64Data },
      body: {},
    };

    const mockRes = {
      status(code: number) {
        responseStatusCode = code;
        return this;
      },
      json(data: unknown) {
        responseJson = data;
      },
      redirect(url: string) {},
    };

    await handler(mockReq, mockRes);

    expect(responseStatusCode).toBe(200);
    expect(hookFired).toBe(true);
    expect(mockReq['payment']).toBeDefined();
    expect((mockReq['payment'] as Record<string, unknown>)['success']).toBe(true);
  });
});
