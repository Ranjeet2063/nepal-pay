import { describe, test, expect } from 'bun:test';
import { NepalPay } from '../src/client';

describe('NepalPay Unified Client', () => {
  const nepalPay = new NepalPay({
    esewa: {
      merchantCode: 'EPAYTEST',
      secretKey: '8gBm/:&EnhH.1/q',
      environment: 'sandbox',
      successUrl: 'https://example.com/esewa/success',
      failureUrl: 'https://example.com/esewa/failure',
    },
    khalti: {
      secretKey: 'test_secret_key',
      environment: 'sandbox',
      returnUrl: 'https://example.com/khalti/return',
    },
    defaultGateway: 'esewa',
  });

  test('successfully resolves default gateway', () => {
    expect(nepalPay.defaultGateway).toBe('esewa');
    expect(nepalPay.getGateway()).toBeDefined();
    expect(nepalPay.esewa).toBeDefined();
    expect(nepalPay.khalti).toBeDefined();
  });

  test('throws error when requesting unconfigured gateway', () => {
    expect(() => nepalPay.fonepay).toThrow('Fonepay gateway is not configured');
    expect(() => nepalPay.getGateway('fonepay')).toThrow(
      "Gateway 'fonepay' is not configured"
    );
  });

  test('routes initiation request to specified gateway', async () => {
    const res = await nepalPay.initiate({
      gateway: 'esewa',
      amount: 250,
      orderId: 'ORDER-250',
    });

    expect(res.gateway).toBe('esewa');
    expect(res.amount).toBe(250);
    expect(res.formFields?.product_code).toBe('EPAYTEST');
  });
});
