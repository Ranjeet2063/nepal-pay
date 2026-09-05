/**
 * Simple NepalPay Demo
 * Run with: bun run examples/simple-checkout.ts
 */
import { NepalPay } from '../src';

async function main() {
  console.log('🇳🇵 Initializing NepalPay SDK...');

  const nepalPay = new NepalPay({
    esewa: {
      merchantCode: 'EPAYTEST',
      secretKey: '8gBm/:&EnhH.1/q',
      environment: 'sandbox',
      successUrl: 'https://mysite.com/payment/success',
      failureUrl: 'https://mysite.com/payment/failure',
    },
    khalti: {
      secretKey: 'test_secret_key_77e7a5b32d204739a85d39be199e4b7c',
      environment: 'sandbox',
      returnUrl: 'https://mysite.com/payment/khalti-callback',
    },
    defaultGateway: 'esewa',
  });

  // 1. Create an eSewa Checkout Session
  console.log('\n--- 1. Testing eSewa (ePaisa V2) Checkout ---');
  const esewaOrder = await nepalPay.initiate({
    gateway: 'esewa',
    amount: 1250,
    orderId: `ORD-${Date.now()}`,
    orderName: 'FolliPulse Scalp Massager',
    taxAmount: 0,
    deliveryCharge: 0,
  });

  console.log('✅ eSewa Payment Form Created:');
  console.log('Target URL:', esewaOrder.redirectUrl);
  console.log('Total Amount:', esewaOrder.amount, 'NPR');
  console.log('Signature:', esewaOrder.formFields?.signature);
  console.log('Transaction UUID:', esewaOrder.formFields?.transaction_uuid);

  console.log('\n✨ NepalPay SDK initialization and payment simulation successful!');
}

main().catch(console.error);
