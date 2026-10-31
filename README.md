<div align="center">

# 🇳🇵 NepalPay

**Unified, Modern, Type-Safe Nepal Payment Gateway SDK**

[![npm downloads](https://img.shields.io/npm/dt/nepal-pay?color=00d2ff&style=for-the-badge&logo=npm)](https://www.npmjs.com/package/nepal-pay)
[![npm version](https://img.shields.io/npm/v/nepal-pay?color=cb3837&style=for-the-badge&logo=npm)](https://www.npmjs.com/package/nepal-pay)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-success?style=for-the-badge)](package.json)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-28%2F28%20Passing-brightgreen?style=for-the-badge)](tests/)

*Integrate eSewa (ePaisa V2), Khalti (ePayment V2), Fonepay (NepalQR), ConnectIPS (NCHL), and IME Pay into your Node.js, Bun, Next.js, or Express app with a single clean API.*

</div>

---

## ⚡ Why NepalPay?

Nepali payment gateways (eSewa, Khalti, Fonepay, ConnectIPS, IME Pay) each have different authentication schemas, payload formats, hashing algorithms (HMAC-SHA256, SHA512, Base64 signatures), and return formats. Developers spend days reading outdated PDFs and debugging base64 payloads.

**NepalPay gives you one clean, universal interface:**
- 🛡️ **Zero External Dependencies**: Built with native Web Crypto / Node crypto and native `fetch`.
- 🏦 **5 Major Gateway Rails**: eSewa V2, Khalti V2, Fonepay, ConnectIPS (NCHL Interbank), and IME Pay.
- 📱 **Dynamic NepalQR Generator**: Generates EMVCo-compliant NepalQR codes readable by any Nepali mobile banking app.
- ⚡ **Drop-in Next.js & Express Handlers**: Pre-built 1-line callback handlers with automatic gateway detection and replay protection.
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
  connectips: {
    merchantId: process.env.CONNECTIPS_MERCHANT_ID || 'MOCK_ID',
    appId: process.env.CONNECTIPS_APP_ID || 'MOCK_APP',
    appName: 'My Store',
    secretKey: process.env.CONNECTIPS_SECRET_KEY || 'mock_secret',
    environment: 'sandbox',
  },
  imepay: {
    merchantCode: process.env.IMEPAY_MERCHANT_CODE || 'MOCK_IME',
    apiUser: 'test_user',
    password: 'test_password',
    environment: 'sandbox',
  },
  defaultGateway: 'esewa',
});
```

---

### 2. Initiate Payment (Universal)

```typescript
// Works identically across any gateway: 'esewa' | 'khalti' | 'fonepay' | 'connectips' | 'imepay'
const payment = await nepalPay.initiate({
  gateway: 'connectips', // or 'esewa', 'khalti', 'imepay', 'fonepay'
  amount: 2500,          // in NPR
  orderId: 'ORDER-2026-001',
  orderName: 'Medical Consultation',
  customer: {
    name: 'Ranjeet Kumar',
    email: 'ranjeet@example.com',
    phone: '9800000001',
  }
});

console.log(payment.redirectUrl); // Gateway checkout URL
console.log(payment.formFields);  // Signed parameters ready for auto-submit form
```

---

### 3. Dynamic NepalQR (EMVCo Standard) Generation

Generate an on-screen dynamic QR code scannable by all Nepali mobile banking apps (Global IME, Nabil, NIC Asia, eSewa, Khalti):

```typescript
const qr = nepalPay.generateDynamicQR({
  amount: 1500,
  orderId: 'ORDER-QR-1001',
  merchantName: 'BhatBhateni Supermarket',
  remarks: 'Store checkout',
});

console.log(qr.qrString);
// Output: 00020101021226...530352454071500.005802NP...6304E2B1
```

---

### 4. Drop-in Next.js App Router Webhook / Callback Handler

Create `app/api/payment/callback/route.ts`:

```typescript
import { createPaymentCallbackHandler } from 'nepal-pay/next';
import { nepalPay } from '@/lib/nepalpay';

export const GET = createPaymentCallbackHandler({
  client: nepalPay,
  expectedAmount: 1500, // or async function: (orderId) => getOrderAmount(orderId)
  successRedirect: (res) => `/checkout/success?orderId=${res.orderId}`,
  failureRedirect: (res) => `/checkout/failed?orderId=${res.orderId}`,
  onSuccess: async (payment) => {
    // Automatically called upon verified tamper-proof payment confirmation
    console.log(`Payment confirmed! ID: ${payment.transactionId}, Amount: ${payment.amount}`);
    await db.orders.update({ where: { id: payment.orderId }, data: { status: 'PAID' } });
  },
});

export const POST = GET;
```

---

### 5. Drop-in Express.js Middleware

```typescript
import express from 'express';
import { createExpressPaymentHandler } from 'nepal-pay/express';
import { nepalPay } from './nepalpay';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.all('/api/payment/callback', createExpressPaymentHandler({
  client: nepalPay,
  onSuccess: async (payment) => {
    console.log('Payment verified successfully for order:', payment.orderId);
  },
  successRedirect: '/success',
  failureRedirect: '/failed',
}));
```

---

## 🔒 Security & Verification

NepalPay eliminates man-in-the-middle payment spoofing:
- **eSewa V2**: Reconstructs dynamic HMAC-SHA256 signature from `signed_field_names` and verifies against response.
- **Khalti V2**: Performs server-to-server transaction lookup via Khalti API with merchant secret key.
- **ConnectIPS**: Verifies creditor validation token using NCHL interbank verification endpoint.
- **IME Pay**: Validates response tokens and issues direct confirmation handshakes.
- **Replay Protection**: Auto-checks amount divergence and flags mismatched or tampered callbacks as `AMBIGUOUS`.

---

## 📄 License

MIT © [Ranjeet Kumar](https://github.com/Ranjeet2063)
