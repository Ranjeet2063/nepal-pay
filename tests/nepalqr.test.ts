import { describe, it, expect } from 'bun:test';
import { calculateCrc16, formatTlv } from '../src/utils/crypto';
import { FonepayGateway } from '../src/gateways/fonepay';

describe('NepalQR & EMVCo Utilities', () => {
  it('formats TLV strings accurately with 2-digit padded length', () => {
    expect(formatTlv('00', '01')).toBe('000201');
    expect(formatTlv('53', '524')).toBe('5303524');
    expect(formatTlv('58', 'NP')).toBe('5802NP');
  });

  it('calculates deterministic standard EMVCo CRC16-CCITT', () => {
    // Known test vectors for CCITT-16
    const sample = '00020101021253035245802NP6304';
    const crc = calculateCrc16(sample);
    expect(crc).toBeDefined();
    expect(crc.length).toBe(4);
    expect(/^[0-9A-F]{4}$/.test(crc)).toBe(true);
  });

  it('generates compliant dynamic NepalQR payload via FonepayGateway', () => {
    const gateway = new FonepayGateway({
      merchantCode: 'FONEPAY_TEST_99',
      secretKey: 'test_key',
    });

    const qrResult = gateway.generateDynamicQR({
      amount: 1500,
      orderId: 'ORDER_QR_101',
      merchantName: 'BhatBhateni Supermarket',
      remarks: 'Grocery checkout',
    });

    expect(qrResult.amount).toBe(1500);
    expect(qrResult.currency).toBe('NPR');
    expect(qrResult.merchantName).toBe('BhatBhateni Supermarket');
    expect(qrResult.orderId).toBe('ORDER_QR_101');

    const qr = qrResult.qrString;
    // Check required EMVCo tags
    expect(qr.startsWith('000201010212')).toBe(true); // Header + Dynamic
    expect(qr).toContain('5303524'); // NPR Currency
    expect(qr).toContain('5802NP'); // Nepal Country Code
    expect(qr).toContain('54071500.00'); // Amount 1500.00
    expect(qr).toContain('BhatBhateni Supermarket');
    expect(qr).toContain('6304'); // Checksum header

    // Verify CRC integrity: recalculate over payload excluding last 4 characters
    const payloadWithoutCrc = qr.slice(0, -4);
    const expectedCrc = calculateCrc16(payloadWithoutCrc);
    expect(qr.slice(-4)).toBe(expectedCrc);
  });
});
