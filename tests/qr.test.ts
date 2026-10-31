import { describe, expect, it } from 'bun:test';
import { generateQrMatrix, renderTerminalQr, generateTerminalQr } from '../src/utils/qr';
import { FonepayGateway } from '../src/gateways/fonepay';

describe('Zero-Dependency Terminal QR Generator', () => {
  it('generates a valid square matrix for text data', () => {
    const text = 'Hello NepalPay';
    const matrix = generateQrMatrix(text);

    expect(matrix.length).toBeGreaterThan(0);
    expect(matrix.length).toBe(matrix[0].length); // Must be square
    // Version 1 or 2 is 21x21 or 25x25
    expect([21, 25]).toContain(matrix.length);
  });

  it('correctly places 7x7 finder patterns in 3 corners', () => {
    const matrix = generateQrMatrix('Test');
    const size = matrix.length;

    // Top-left finder center (3, 3) must be dark (true)
    expect(matrix[3][3]).toBe(true);

    // Top-right finder center (3, size - 4) must be dark
    expect(matrix[3][size - 4]).toBe(true);

    // Bottom-left finder center (size - 4, 3) must be dark
    expect(matrix[size - 4][3]).toBe(true);
  });

  it('renders terminal QR string with Unicode half-block characters', () => {
    const matrix = generateQrMatrix('https://nepalpay.dev');
    const qrString = renderTerminalQr(matrix, { quietZone: 2 });

    expect(typeof qrString).toBe('string');
    expect(qrString.length).toBeGreaterThan(100);

    // Should contain block characters
    const hasBlocks = qrString.includes('▀') || qrString.includes('▄') || qrString.includes('█');
    expect(hasBlocks).toBe(true);
  });

  it('successfully generates terminal QR for full EMVCo NepalQR payload', () => {
    const fonepay = new FonepayGateway({
      merchantCode: 'TEST_MERCHANT',
      secretKey: 'secret123'
    });

    const qrResult = fonepay.generateDynamicQR({
      amount: 1250,
      orderId: 'BILL-10023',
      merchantName: 'Annapurna Trekking Supplies',
      merchantCity: 'Pokhara'
    });

    expect(qrResult.qrString).toContain('NP.FONEPAY.MERCHANT');

    const terminalDisplay = generateTerminalQr(qrResult.qrString);
    expect(terminalDisplay).toBeDefined();
    expect(terminalDisplay.split('\n').length).toBeGreaterThan(15);
  });

  it('throws an error when data exceeds maximum supported capacity', () => {
    const hugeData = 'A'.repeat(600);
    expect(() => generateQrMatrix(hugeData)).toThrow(/Data too large/);
  });
});
