import { describe, test, expect } from 'bun:test';
import {
  generateHmacSha256,
  generateHmacSha512,
  encodeBase64,
  decodeBase64,
  verifyEsewaSignature,
} from '../src/utils/crypto';

describe('Crypto Utilities', () => {
  const secretKey = 'test_secret_key';

  test('generateHmacSha256 produces valid base64 hash', () => {
    const data = 'total_amount=100,transaction_uuid=ORD-1,product_code=EPAYTEST';
    const hash = generateHmacSha256(data, secretKey);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(10);
  });

  test('generateHmacSha512 produces valid hex hash', () => {
    const data = 'fonepay_merchant,ORD-1,100.00';
    const hash = generateHmacSha512(data, secretKey);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(128); // 512 bits in hex = 128 characters
  });

  test('encodeBase64 and decodeBase64 are symmetric', () => {
    const raw = 'Hello Nepal! नमस्ते काठमाडौँ';
    const encoded = encodeBase64(raw);
    const decoded = decodeBase64(encoded);
    expect(decoded).toBe(raw);
  });

  test('verifyEsewaSignature accurately validates matching signature', () => {
    const fields: Record<string, unknown> = {
      transaction_code: '00078O2',
      status: 'COMPLETE',
      total_amount: 150,
      transaction_uuid: 'ORDER-99',
      product_code: 'EPAYTEST',
      signed_field_names: 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
    };

    // Calculate valid signature
    const parts = [
      'transaction_code=00078O2',
      'status=COMPLETE',
      'total_amount=150',
      'transaction_uuid=ORDER-99',
      'product_code=EPAYTEST',
      'signed_field_names=transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
    ];
    const validSignature = generateHmacSha256(parts.join(','), secretKey);

    expect(verifyEsewaSignature(fields, validSignature, secretKey)).toBe(true);
  });

  test('verifyEsewaSignature rejects tampered fields', () => {
    const fields: Record<string, unknown> = {
      transaction_code: '00078O2',
      status: 'COMPLETE',
      total_amount: 150, // attacker changed amount
      transaction_uuid: 'ORDER-99',
      product_code: 'EPAYTEST',
      signed_field_names: 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
    };

    const invalidSignature = 'tampered_signature_string';
    expect(verifyEsewaSignature(fields, invalidSignature, secretKey)).toBe(false);
  });
});
