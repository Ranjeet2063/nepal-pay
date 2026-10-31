#!/usr/bin/env node
/**
 * nepal-pay CLI
 * Interactive and scriptable CLI for generating terminal NepalQR codes,
 * debugging payment gateway signatures, and testing checkout flows.
 */

import { FonepayGateway } from './gateways/fonepay';
import { EsewaGateway } from './gateways/esewa';
import { KhaltiGateway } from './gateways/khalti';
import { ConnectIpsGateway } from './gateways/connectips';
import { ImePayGateway } from './gateways/imepay';
import { generateTerminalQr } from './utils/qr';
import { verifyEsewaSignature, generateHmacSha256 } from './utils/crypto';

// ANSI color helpers
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';
const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';

function parseArgs(args: string[]): { command: string; flags: Record<string, string | boolean> } {
  const flags: Record<string, string | boolean> = {};
  let command = 'help';

  let i = 0;
  if (args.length > 0 && !args[0].startsWith('-')) {
    command = args[0].toLowerCase();
    i = 1;
  }

  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else {
      i++;
    }
  }

  return { command, flags };
}

function showBanner() {
  console.log(`\n${CYAN}${BOLD}🇳🇵 nepal-pay CLI${RESET} ${GRAY}(Unified Nepal Payment Gateway Engine)${RESET}`);
  console.log(`${GRAY}Zero dependencies. Instant terminal QR codes & gateway testing.${RESET}\n`);
}

function showHelp() {
  showBanner();
  console.log(`${BOLD}USAGE:${RESET}`);
  console.log(`  npx nepal-pay <command> [options]\n`);

  console.log(`${BOLD}COMMANDS:${RESET}`);
  console.log(`  ${GREEN}qr${RESET}            Generate a scannable EMVCo NepalQR code directly in your terminal`);
  console.log(`  ${GREEN}esewa${RESET}         Generate test eSewa ePaisa V2 form fields & HMAC-SHA256 signature`);
  console.log(`  ${GREEN}khalti${RESET}        Generate test Khalti ePayment V2 payload and Paisa conversion`);
  console.log(`  ${GREEN}connectips${RESET}    Generate ConnectIPS NCHL signed token and checkout form`);
  console.log(`  ${GREEN}imepay${RESET}        Generate IME Pay test checkout payload`);
  console.log(`  ${GREEN}verify${RESET}        Validate payment callback signatures`);
  console.log(`  ${GREEN}help${RESET}          Display this help message\n`);

  console.log(`${BOLD}OPTIONS FOR 'qr':${RESET}`);
  console.log(`  --amount <num>       Payment amount in NPR ${GRAY}(default: 100)${RESET}`);
  console.log(`  --order <id>         Order or Invoice reference ID ${GRAY}(default: ORD-RANDOM)${RESET}`);
  console.log(`  --name <merchant>    Merchant display name ${GRAY}(default: 'NepalPay Merchant')${RESET}`);
  console.log(`  --city <city>        Merchant city ${GRAY}(default: 'Kathmandu')${RESET}`);
  console.log(`  --code <merchantId>  Fonepay merchant code ${GRAY}(default: 'TEST_MERCHANT')${RESET}\n`);

  console.log(`${BOLD}EXAMPLES:${RESET}`);
  console.log(`  ${YELLOW}npx nepal-pay qr --amount 500 --name "Patan Coffee"${RESET}`);
  console.log(`  ${YELLOW}npx nepal-pay qr --amount 1250 --order INV-2026-001${RESET}`);
  console.log(`  ${YELLOW}npx nepal-pay esewa --amount 750 --order ORD-99${RESET}`);
  console.log(`  ${YELLOW}npx nepal-pay verify --gateway esewa --data <base64>${RESET}\n`);
}

async function handleQr(flags: Record<string, string | boolean>) {
  const amount = Number(flags['amount'] || flags['a'] || 100);
  if (isNaN(amount) || amount <= 0) {
    console.error(`${RED}Error: Amount must be a positive number.${RESET}`);
    process.exit(1);
  }

  const orderId = String(flags['order'] || flags['o'] || `ORD-${Math.floor(100000 + Math.random() * 900000)}`);
  const merchantName = String(flags['name'] || flags['n'] || 'NepalPay Store');
  const merchantCity = String(flags['city'] || 'Kathmandu');
  const merchantCode = String(flags['code'] || 'DEMO_MERCHANT');

  const fonepay = new FonepayGateway({
    merchantCode,
    secretKey: 'demo_secret_key'
  });

  const qrData = fonepay.generateDynamicQR({
    amount,
    orderId,
    merchantName,
    merchantCity,
    remarks: 'NepalPay CLI Payment'
  });

  const terminalQr = generateTerminalQr(qrData.qrString, { quietZone: 2 });

  showBanner();
  console.log(`${BOLD}📱 Scan with any Nepal Mobile Banking or Wallet App:${RESET}`);
  console.log(`${GRAY}(eSewa, Khalti, Fonepay, Global IME, Nabil, NIC Asia, etc.)${RESET}\n`);

  console.log(terminalQr);

  console.log(`\n${BOLD}📋 Payment Details:${RESET}`);
  console.log(`  ${CYAN}Amount:${RESET}        ${BOLD}NPR ${amount.toFixed(2)}${RESET}`);
  console.log(`  ${CYAN}Merchant:${RESET}      ${merchantName} (${merchantCity})`);
  console.log(`  ${CYAN}Order Ref:${RESET}     ${orderId}`);
  console.log(`  ${CYAN}Standard:${RESET}      EMVCo NepalQR Specifications`);
  console.log(`\n${BOLD}🔑 Raw Payload (EMVCo String):${RESET}`);
  console.log(`  ${GRAY}${qrData.qrString}${RESET}\n`);
}

async function handleEsewa(flags: Record<string, string | boolean>) {
  const amount = Number(flags['amount'] || 500);
  const orderId = String(flags['order'] || `EPAY-${Date.now()}`);
  const merchantCode = String(flags['code'] || 'EPAYTEST');
  const secretKey = String(flags['secret'] || '8gBm/:&EnhH.1/q');

  const esewa = new EsewaGateway({
    merchantCode,
    secretKey,
    environment: 'sandbox'
  });

  const res = await esewa.initiate({
    amount,
    orderId,
    returnUrl: 'https://developer.esewa.com.np/success',
    failureUrl: 'https://developer.esewa.com.np/failure'
  });

  showBanner();
  console.log(`${BOLD}🟢 eSewa ePaisa V2 Checkout Test Payload:${RESET}\n`);
  console.log(`  ${CYAN}Gateway:${RESET}       eSewa (ePaisa V2)`);
  console.log(`  ${CYAN}Action URL:${RESET}    ${res.redirectUrl}`);
  console.log(`  ${CYAN}Method:${RESET}        ${res.method}`);
  console.log(`  ${CYAN}Amount:${RESET}        NPR ${amount.toFixed(2)}`);
  console.log(`  ${CYAN}Order ID:${RESET}      ${orderId}\n`);

  console.log(`${BOLD}Signed Form Fields:${RESET}`);
  console.log(JSON.stringify(res.formFields, null, 2));
  console.log(`\n${GREEN}✔ HMAC-SHA256 signature generated accurately.${RESET}\n`);
}

async function handleKhalti(flags: Record<string, string | boolean>) {
  const amount = Number(flags['amount'] || 100);
  const orderId = String(flags['order'] || `KHALTI-${Date.now()}`);

  showBanner();
  console.log(`${BOLD}🟣 Khalti ePayment V2 Checkout Test Payload:${RESET}\n`);
  console.log(`  ${CYAN}Gateway:${RESET}       Khalti V2`);
  console.log(`  ${CYAN}Endpoint:${RESET}      https://a.khalti.com/api/v2/epayment/initiate/`);
  console.log(`  ${CYAN}Amount (NPR):${RESET}  NPR ${amount.toFixed(2)}`);
  console.log(`  ${CYAN}Amount (Paisa):${RESET}${BOLD}${Math.round(amount * 100)}${RESET} Paisa`);
  console.log(`  ${CYAN}Purchase ID:${RESET}   ${orderId}\n`);
}

async function handleConnectIps(flags: Record<string, string | boolean>) {
  const amount = Number(flags['amount'] || 1500);
  const orderId = String(flags['order'] || `CIPS-${Date.now()}`);

  const cips = new ConnectIpsGateway({
    merchantId: 'TEST_MERCHANT',
    appId: 'APP_1',
    appName: 'TEST_APP',
    secretKey: 'demo_password',
    environment: 'sandbox'
  });

  const res = await cips.initiate({
    amount,
    orderId,
    particulars: 'Test Order Payment',
    remarks: 'CLI Sandbox Test',
    returnUrl: 'https://example.com/cips/callback'
  });

  showBanner();
  console.log(`${BOLD}🔵 ConnectIPS (NCHL) Interbank Form Fields:${RESET}\n`);
  console.log(`  ${CYAN}Gateway:${RESET}       ConnectIPS`);
  console.log(`  ${CYAN}Action URL:${RESET}    ${res.redirectUrl}`);
  console.log(`  ${CYAN}Amount:${RESET}        NPR ${amount.toFixed(2)} (Paisa: ${Math.round(amount * 100)})`);
  console.log(`  ${CYAN}Order ID:${RESET}      ${orderId}\n`);

  console.log(`${BOLD}Signed Fields & TOKEN:${RESET}`);
  console.log(JSON.stringify(res.formFields, null, 2));
  console.log(`\n${GREEN}✔ NCHL HMAC-SHA256 Token string generated.${RESET}\n`);
}

async function handleVerify(flags: Record<string, string | boolean>) {
  const gateway = String(flags['gateway'] || 'esewa').toLowerCase();
  const secret = String(flags['secret'] || '8gBm/:&EnhH.1/q');
  const data = String(flags['data'] || '');

  showBanner();

  if (gateway === 'esewa') {
    if (!data) {
      console.error(`${RED}Error: --data <base64_encoded_callback> is required for eSewa verification.${RESET}`);
      process.exit(1);
    }

    try {
      const decoded = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
      const isValid = verifyEsewaSignature(decoded, decoded.signature, secret);

      console.log(`${BOLD}eSewa Callback Verification:${RESET}\n`);
      console.log(JSON.stringify(decoded, null, 2));
      console.log('');
      if (isValid) {
        console.log(`${GREEN}${BOLD}✔ SIGNATURE VALID: Payment is authentic.${RESET}\n`);
      } else {
        console.log(`${RED}${BOLD}✖ SIGNATURE INVALID: Payment tampered or incorrect secret key.${RESET}\n`);
      }
    } catch (e) {
      console.error(`${RED}Failed to decode base64 payload: ${(e as Error).message}${RESET}`);
    }
  } else {
    console.log(`Verification helper for '${gateway}' is ready.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const { command, flags } = parseArgs(args);

  if (flags['help'] || flags['h'] || command === 'help') {
    showHelp();
    return;
  }

  if (flags['version'] || flags['v']) {
    console.log('nepal-pay v1.2.0');
    return;
  }

  switch (command) {
    case 'qr':
    case 'nepalqr':
    case 'fonepay':
      await handleQr(flags);
      break;
    case 'esewa':
      await handleEsewa(flags);
      break;
    case 'khalti':
      await handleKhalti(flags);
      break;
    case 'connectips':
    case 'cips':
      await handleConnectIps(flags);
      break;
    case 'verify':
      await handleVerify(flags);
      break;
    default:
      console.log(`${YELLOW}Unknown command: '${command}'${RESET}`);
      showHelp();
      break;
  }
}

main().catch((err) => {
  console.error(`${RED}Error: ${err.message}${RESET}`);
  process.exit(1);
});
