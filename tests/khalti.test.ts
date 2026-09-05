import { describe, test, expect, mock, spyOn } from 'bun:test';
import { KhaltiGateway } from '../src/gateways/khalti';

describe('Khalti V2 Gateway', () => {
  const khalti = new KhaltiGateway({
    secretKey: 'test_secret_key_1234567890',
    environment: 'sandbox',
    returnUrl: 'https://example.com/khalti/callback',
    websiteUrl: 'https://example.com',
  });

  test('converts NPR amount to Paisa correctly and returns payment URL', async () => {
    // Mock global fetch for initiate
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      expect(body.amount).toBe(15000); // 150 NPR = 15000 paisa
      expect(body.purchase_order_id).toBe('KHALTI-101');
      return new Response(
        JSON.stringify({
          pidx: 'test_pidx_abc123',
          payment_url: 'https://test-pay.khalti.com/?pidx=test_pidx_abc123',
          expires_at: '2026-09-05T12:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    try {
      const res = await khalti.initiate({
        amount: 150,
        orderId: 'KHALTI-101',
        orderName: 'Book Purchase',
        customer: {
          name: 'Sita Sharma',
          email: 'sita@example.com',
        },
      });

      expect(res.gateway).toBe('khalti');
      expect(res.amount).toBe(150);
      expect(res.pidx).toBe('test_pidx_abc123');
      expect(res.redirectUrl).toContain('test-pay.khalti.com');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('verifies payment lookup with Completed status', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      expect(body.pidx).toBe('test_pidx_abc123');
      return new Response(
        JSON.stringify({
          pidx: 'test_pidx_abc123',
          total_amount: 15000,
          status: 'Completed',
          transaction_id: 'TXN-KHALTI-999',
          purchase_order_id: 'KHALTI-101',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    try {
      const res = await khalti.verify({
        payload: { pidx: 'test_pidx_abc123' },
        amount: 150,
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('COMPLETED');
      expect(res.amount).toBe(150); // Converted back from 15000 paisa to 150 NPR
      expect(res.transactionId).toBe('TXN-KHALTI-999');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
