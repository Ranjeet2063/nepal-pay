<div align="center">

# 🇳🇵 NepalPay

**Unified, Modern, Type-Safe Nepal Payment Gateway SDK**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-success?style=for-the-badge)](package.json)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-14%2F14%20Passing-brightgreen?style=for-the-badge)](tests/)

*Integrate eSewa (ePaisa V2), Khalti (ePayment V2), and Fonepay into your Node.js, Bun, or Next.js app with a single clean API.*

</div>

---

## ⚡ Why NepalPay?

Nepali payment gateways (eSewa, Khalti, Fonepay) each have different authentication schemas, payload formats, hashing algorithms (HMAC-SHA256 vs SHA512), and return signatures. Developers spend days reading outdated PDFs and debugging base64 payloads.

**NepalPay gives you one clean, universal interface:**
- 🛡️ **Zero External Dependencies**: Built with native Web Crypto / Node crypto and native `fetch`.
- 🔒 **Tamper-Proof Verification**: Automatic HMAC-SHA256 and Base64 response signature validation.
- 🚀 **Full-Stack Compatibility**: Works out-of-the-box in Node.js, Bun, Next.js (App & Pages router), Remix, Nuxt, and Express.
- 🎯 **100% Type-Safe**: Complete TypeScript types for all options, payloads, and response objects.

---

## 📦 Installation

```bash
# npm
npm install nepal-pay

# bun
bun add nepal-pay

# yarn / pnpm
yarn add nepal-pay
pnpm add nepal-pay
```

---

## 🚀 Quickstart

### 1. Initialize Client

```typescript
import { NepalPay } from 'nepal-pay';

export const nepalPay = new NepalPay({
  esewa: {
    merchantCode: process.env.ESEWA_MERCHANT_CODE || 'EPAYTEST',
    secretKey: process.env.ESEWA_SECRET_KEY || '8gBm/:&EnhH.1/q',
    environment: 'sandbox', // 'sandbox' | 'live'
    successUrl: 'https://mysite.com/api/payment/callback?gateway=esewa',
    failureUrl: 'https://mysite.com/payment/failed',
  },
  khalti: {
    secretKey: process.env.KHALTI_SECRET_KEY || 'test_secret_key_...',
    environment: 'sandbox',
    returnUrl: 'https://mysite.com/api/payment/callback?gateway=khalti',
  },
  defaultGateway: 'esewa',
});
```

---

### 2. Initiate Payment (Universal)

```typescript
// Create a payment session
const payment = await nepalPay.initiate({
  gateway: 'esewa', // or 'khalti' / 'fonepay'
  amount: 1500,     // in NPR
  orderId: 'ORDER-2026-001',
  orderName: 'FolliPulse Scalp Massager',
  customer: {
    name: 'Ram Bahadur',
    email: 'ram@example.com',
    phone: '9800000001',
  }
});

// eSewa returns redirect form fields with valid HMAC signature:
console.log(payment.redirectUrl); // e.g. https://rc-epay.esewa.com.np/api/epay/main/v2/form
console.log(payment.formFields);  // auto-generated signature, amount, and parameters

// Khalti returns a direct checkout URL:
// res.redirect(payment.redirectUrl);
```

---

### 3. Verify Payment Callback / Webhook

```typescript
// In your callback API route:
const verification = await nepalPay.verify('esewa', {
  payload: req.query.data, // eSewa encoded base64 payload or Khalti pidx
  amount: 1500,            // optional: double-checks paid amount matches expected order
  orderId: 'ORDER-2026-001'
});

if (verification.success && verification.status === 'COMPLETED') {
  console.log(`✅ Order ${verification.orderId} verified! Reference ID: ${verification.transactionId}`);
  // Fulfill order in your database
} else {
  console.error(`❌ Payment verification failed: ${verification.message}`);
}
```

---

## 🛠️ Next.js App Router Example

```typescript
// app/api/checkout/route.ts
import { NextResponse } from 'next/server';
import { nepalPay } from '@/lib/nepalpay';

export async function POST(req: Request) {
  const { amount, orderId, gateway } = await req.json();

  const session = await nepalPay.initiate({
    gateway,
    amount,
    orderId,
  });

  return NextResponse.json(session);
}

// app/api/payment/callback/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const data = searchParams.get('data'); // eSewa payload
  const pidx = searchParams.get('pidx'); // Khalti payload

  const verification = await nepalPay.verify(data ? 'esewa' : 'khalti', {
    payload: data || pidx!,
  });

  if (verification.success) {
    return NextResponse.redirect(new URL(`/orders/${verification.orderId}/success`, req.url));
  }

  return NextResponse.redirect(new URL('/orders/failed', req.url));
}
```

---

## 🧪 Free Developer Sandbox Credentials

| Gateway | Environment | Test Merchant Code | Test Secret Key |
|---|---|---|---|
| **eSewa V2** | Sandbox | `EPAYTEST` | `8gBm/:&EnhH.1/q` |
| **Khalti V2** | Sandbox | *(Generated instantly via [test-admin.khalti.com](https://test-admin.khalti.com))* | `test_secret_key_...` |

---

## 🧪 Running Tests

```bash
bun test
# or
npm test
```

All 14 unit test suites execute against simulated gateway challenges, payload validation, and HMAC tampering checks in under 200ms.

---

## 📄 License

MIT © [Ranjeet](https://github.com/Ranjeet2063)
