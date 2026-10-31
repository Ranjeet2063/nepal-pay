import { describe, it, expect, mock } from 'bun:test';
import { ImePayGateway } from '../src/gateways/imepay';

describe('IME Pay Gateway', () => {
  const config = {
    merchantCode: 'IME_TEST_MERCHANT',
    apiUser: 'test_user',
    password: 'test_password',
    environment: 'sandbox' as const,
    returnUrl: 'https://example.com/payment/imepay/callback',
  };

  const gateway = new ImePayGateway(config);

  it('initiates IME Pay checkout with form fields and redirectUrl', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          ResponseCode: 0,
          ResponseDescription: 'Success',
          TokenId: 'IME_TEST_TOKEN_123',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    try {
      const res = await gateway.initiate({
        amount: 1200,
        orderId: 'ORDER_IME_998',
      });

      expect(res.gateway).toBe('imepay');
      expect(res.orderId).toBe('ORDER_IME_998');
      expect(res.amount).toBe(1200);
      expect(res.method).toBe('POST');
      expect(res.redirectUrl).toContain('https://stg.imepay.com.np:7979/api/Web/Checkout');
      expect(res.formFields).toBeDefined();
      expect(res.formFields!.MerchantCode).toBe('IME_TEST_MERCHANT');
      expect(res.formFields!.RefId).toBe('ORDER_IME_998');
      expect(res.formFields!.TokenId).toBe('IME_TEST_TOKEN_123');
      expect(res.formFields!.Amount).toBe('1200.00');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects invalid amounts', async () => {
    expect(
      gateway.initiate({
        amount: -50,
        orderId: 'ORDER_NEG',
      })
    ).rejects.toThrow('Payment amount must be a positive number');
  });

  it('verifies successful payment callback with ResponseCode 0', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          ResponseCode: 0,
          ResponseDescription: 'Transaction Confirmed',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    try {
      const callbackPayload = {
        ResponseCode: 0,
        ResponseDescription: 'Success',
        Msisdn: '9841000000',
        TransactionId: 'IME_TXN_8888',
        RefId: 'ORDER_IME_998',
        TokenId: 'IME_TOK_1111',
        Amount: 1200,
      };

      const res = await gateway.verify({
        payload: callbackPayload,
        orderId: 'ORDER_IME_998',
        amount: 1200,
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('COMPLETED');
      expect(res.orderId).toBe('ORDER_IME_998');
      expect(res.transactionId).toBe('IME_TXN_8888');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('marks failed callback when ResponseCode is non-zero', async () => {
    const callbackPayload = {
      ResponseCode: 1,
      ResponseDescription: 'User cancelled transaction',
      RefId: 'ORDER_IME_CANCEL',
    };

    const res = await gateway.verify({
      payload: callbackPayload,
      orderId: 'ORDER_IME_CANCEL',
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('FAILED');
  });
});
