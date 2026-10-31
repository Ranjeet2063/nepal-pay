import { describe, it, expect } from 'bun:test';
import { ConnectIpsGateway } from '../src/gateways/connectips';

describe('ConnectIPS Gateway', () => {
  const config = {
    merchantId: 'MOCK_MERCHANT_101',
    appId: 'MERCHANT_APP_01',
    appName: 'NepalPay Merchant',
    secretKey: 'mock_nchl_secret_key',
    environment: 'sandbox' as const,
    returnUrl: 'https://example.com/payment/connectips/callback',
  };

  const gateway = new ConnectIpsGateway(config);

  it('initiates ConnectIPS payment with required signed form fields', async () => {
    const res = await gateway.initiate({
      amount: 2500.5,
      orderId: 'ORDER_NCHL_1234',
      orderName: 'Hospital bill',
      remarks: 'Lab test',
      particulars: 'Pathology invoice',
    });

    expect(res.gateway).toBe('connectips');
    expect(res.orderId).toBe('ORDER_NCHL_1234');
    expect(res.amount).toBe(2500.5);
    expect(res.method).toBe('POST');
    expect(res.redirectUrl).toBe('https://uat.connectips.com/connectipswebgw/loginpage');

    expect(res.formFields).toBeDefined();
    expect(res.formFields!.MERCHANTID).toBe('MOCK_MERCHANT_101');
    expect(res.formFields!.APPID).toBe('MERCHANT_APP_01');
    expect(res.formFields!.APPNAME).toBe('NepalPay Merchant');
    expect(res.formFields!.TXNID).toBe('ORDER_NCHL_1234');
    expect(res.formFields!.TXNCRNCY).toBe('NPR');
    expect(res.formFields!.TXNAMT).toBe('250050'); // 2500.5 * 100 in Paisa
    expect(res.formFields!.REFERENCEID).toBe('ORDER_NCHL_1234');
    expect(res.formFields!.TOKEN).toBeDefined();
    expect(res.formFields!.TOKEN.length).toBeGreaterThan(10);
  });

  it('rejects invalid non-positive amounts', async () => {
    expect(
      gateway.initiate({
        amount: 0,
        orderId: 'ORDER_ZERO',
      })
    ).rejects.toThrow('Payment amount must be a positive number');
  });

  it('handles verification with missing TXNID gracefully', async () => {
    const res = await gateway.verify({
      payload: {},
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('FAILED');
    expect(res.message).toContain('Missing TXNID');
  });
});
