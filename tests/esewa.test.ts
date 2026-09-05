import { describe, test, expect } from 'bun:test';
import { EsewaGateway } from '../src/gateways/esewa';
import { encodeBase64, generateHmacSha256 } from '../src/utils/crypto';

describe('eSewa V2 Gateway', () => {
  const testSecretKey = '8gBm/:&EnhH.1/q';
  const esewa = new EsewaGateway({
    merchantCode: 'EPAYTEST',
    secretKey: testSecretKey,
    environment: 'sandbox',
    successUrl: 'https://example.com/success',
    failureUrl: 'https://example.com/failure',
  });

  test('initiates eSewa payment with required V2 form fields', async () => {
    const init = await esewa.initiate({
      amount: 500,
      orderId: 'ORD-1001',
      taxAmount: 65,
      deliveryCharge: 50,
      serviceCharge: 10,
    });

    expect(init.gateway).toBe('esewa');
    expect(init.method).toBe('POST');
    expect(init.orderId).toBe('ORD-1001');
    expect(init.amount).toBe(625); // 500 + 65 + 50 + 10
    expect(init.redirectUrl).toBe('https://rc-epay.esewa.com.np/api/epay/main/v2/form');

    const fields = init.formFields!;
    expect(fields.total_amount).toBe('625');
    expect(fields.transaction_uuid).toBe('ORD-1001');
    expect(fields.product_code).toBe('EPAYTEST');
    expect(fields.signed_field_names).toBe('total_amount,transaction_uuid,product_code');
    expect(typeof fields.signature).toBe('string');
  });

  test('rejects negative or zero amount', async () => {
    expect(
      esewa.initiate({
        amount: -50,
        orderId: 'ORD-NEG',
      })
    ).rejects.toThrow('Payment amount must be a positive number');
  });

  test('verifies valid base64 callback response', async () => {
    const rawFields = {
      transaction_code: '000TEST1',
      status: 'COMPLETE',
      total_amount: 500,
      transaction_uuid: 'ORD-1001',
      product_code: 'EPAYTEST',
      signed_field_names: 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
    };

    const signatureString =
      'transaction_code=000TEST1,status=COMPLETE,total_amount=500,transaction_uuid=ORD-1001,product_code=EPAYTEST,signed_field_names=transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names';
    const signature = generateHmacSha256(signatureString, testSecretKey);

    const payloadObj = {
      ...rawFields,
      signature,
    };

    const base64Data = encodeBase64(JSON.stringify(payloadObj));

    const result = await esewa.verify({
      payload: base64Data,
      orderId: 'ORD-1001',
      amount: 500,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(result.transactionId).toBe('000TEST1');
    expect(result.amount).toBe(500);
  });

  test('flags tampered signature as AMBIGUOUS and unsuccessful', async () => {
    const payloadObj = {
      transaction_code: '000FAKEX',
      status: 'COMPLETE',
      total_amount: 1000,
      transaction_uuid: 'ORD-999',
      product_code: 'EPAYTEST',
      signed_field_names: 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
      signature: 'invalid_tampered_signature',
    };

    const base64Data = encodeBase64(JSON.stringify(payloadObj));

    const result = await esewa.verify({
      payload: base64Data,
      amount: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.message).toContain('Invalid eSewa signature');
  });
});
