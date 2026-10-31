import { createHmac, createHash } from 'node:crypto';

/**
 * Generate SHA256 hash encoded as Hex or Base64.
 */
export function generateSha256(data: string, encoding: 'hex' | 'base64' = 'hex'): string {
  return createHash('sha256').update(data).digest(encoding);
}

/**
 * Calculate standard EMVCo CRC16-CCITT (polynomial 0x1021, init 0xFFFF).
 * Used by NepalQR and Fonepay dynamic QR codes.
 * Returns 4-character uppercase hexadecimal string.
 */
export function calculateCrc16(data: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < data.length; i++) {
    const b = data.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      const bit = ((b >> (7 - j)) & 1) === 1;
      const c15 = ((crc >> 15) & 1) === 1;
      crc = (crc << 1) & 0xffff;
      if (c15 !== bit) {
        crc ^= polynomial;
      }
    }
  }

  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Format a Tag-Length-Value (TLV) string for EMVCo / NepalQR specifications.
 */
export function formatTlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

/**
 * Generate HMAC-SHA256 signature encoded as Base64.
 */
export function generateHmacSha256(data: string, secretKey: string): string {
  return createHmac('sha256', secretKey).update(data).digest('base64');
}

/**
 * Generate HMAC-SHA512 signature encoded as Hex.
 */
export function generateHmacSha512(data: string, secretKey: string): string {
  return createHmac('sha512', secretKey).update(data).digest('hex');
}

/**
 * Safely decode a Base64 string into a UTF-8 string.
 */
export function decodeBase64(base64Str: string): string {
  return Buffer.from(base64Str, 'base64').toString('utf-8');
}

/**
 * Safely encode a UTF-8 string into Base64.
 */
export function encodeBase64(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

/**
 * Verify an eSewa V2 response signature.
 * eSewa passes `signed_field_names` (e.g. "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names")
 * and we concatenate those fields with their values in order: `field1=val1,field2=val2,...`
 */
export function verifyEsewaSignature(
  fields: Record<string, unknown>,
  signature: string,
  secretKey: string
): boolean {
  const signedFieldNames = String(fields['signed_field_names'] || '');
  if (!signedFieldNames) {
    return false;
  }

  const keys = signedFieldNames.split(',');
  const parts: string[] = [];

  for (const k of keys) {
    const val = fields[k] !== undefined && fields[k] !== null ? String(fields[k]) : '';
    parts.push(`${k}=${val}`);
  }

  const dataToSign = parts.join(',');
  const expectedSignature = generateHmacSha256(dataToSign, secretKey);

  return expectedSignature === signature;
}
