import { describe, it, expect, mock } from 'bun:test';
import { NepalPay } from '../src/client';
import { createPaymentCallbackHandler, detectGatewayFromPayload } from '../src/next';
import { encodeBase64, generateHmacSha256 } from '../src/utils/crypto';

describe('Next.js Payment Callback Handler', () => {
  const secretKey = '8gBm/:&EnhH.1/q';
  const client = new NepalPay({
    esewa: {
      merchantCode: 'EPAYTEST',
      secretKey,
    },
    khalti: {
      secretKey: 'test_khalti_secret',
    },
    fonepay: {
      merchantCode: 'FONEPAY_TEST',
      secretKey: 'fonepay_secret',
    },
  });

  it('detects gateway accurately from payload signature keys', () => {
    expect(detectGatewayFromPayload({ data: 'eyJ...}' })).toBe('esewa');
    expect(detectGatewayFromPayload({ pidx: 'abc-123' })).toBe('khalti');
    expect(detectGatewayFromPayload({ PRN: 'ORDER_1', UID: 'FONE_1' })).toBe('fonepay');
    expect(detectGatewayFromPayload({ TXNID: 'NCHL_100' })).toBe('connectips');
    expect(detectGatewayFromPayload({ TokenId: 'IME_999' })).toBe('imepay');
  });

  it('handles valid eSewa callback in GET request and triggers onSuccess', async () => {
    const rawData = {
      transaction_code: 'ESEWA_TXN_001',
      status: 'COMPLETE',
      total_amount: '500',
      transaction_uuid: 'ORDER_NEXT_01',
      product_code: 'EPAYTEST',
      signed_field_names: 'total_amount,transaction_uuid,product_code',
    };

    const dataToSign = `total_amount=500,transaction_uuid=ORDER_NEXT_01,product_code=EPAYTEST`;
    const signature = generateHmacSha256(dataToSign, secretKey);
    const fullPayload = { ...rawData, signature };
    const base64Data = encodeBase64(JSON.stringify(fullPayload));

    let callbackFired = false;
    const handler = createPaymentCallbackHandler({
      client,
      expectedAmount: 500,
      onSuccess: async (res) => {
        callbackFired = true;
        expect(res.status).toBe('COMPLETED');
        expect(res.orderId).toBe('ORDER_NEXT_01');
      },
    });

    const request = new Request(`https://example.com/api/payment/callback?data=${encodeURIComponent(base64Data)}`, {
      method: 'GET',
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    expect(callbackFired).toBe(true);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.gateway).toBe('esewa');
  });

  it('performs 303 redirect on successRedirect option', async () => {
    const rawData = {
      transaction_code: 'ESEWA_TXN_002',
      status: 'COMPLETE',
      total_amount: '300',
      transaction_uuid: 'ORDER_REDIRECT_01',
      product_code: 'EPAYTEST',
      signed_field_names: 'total_amount,transaction_uuid,product_code',
    };
    const signature = generateHmacSha256(
      'total_amount=300,transaction_uuid=ORDER_REDIRECT_01,product_code=EPAYTEST',
      secretKey
    );
    const base64Data = encodeBase64(JSON.stringify({ ...rawData, signature }));

    const handler = createPaymentCallbackHandler({
      client,
      successRedirect: (res) => `https://example.com/checkout/success?id=${res.orderId}`,
    });

    const request = new Request(`https://example.com/api/payment/callback?data=${encodeURIComponent(base64Data)}`, {
      method: 'GET',
    });

    const response = await handler(request);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://example.com/checkout/success?id=ORDER_REDIRECT_01');
  });
});
