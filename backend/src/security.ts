import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const UNIT_QUANTITY = 1 as const;
export const token = () => randomBytes(32).toString('base64url');
export const otp = () => randomInt(0, 1_000_000).toString().padStart(6, '0');
export const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
export const secretHash = (value: string, pepper: string) => createHmac('sha256', pepper).update(value).digest('hex');
export function secretEquals(value: string, expected: string, pepper: string) {
  const a = Buffer.from(secretHash(value, pepper), 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unitItems(items: Array<{ variantId: string; lotId: string; quantity?: number; risk?: string }>) {
  if (!items.length) throw new Error('Escolha ao menos um EPI.');
  for (const item of items) if (item.quantity !== undefined && item.quantity !== 1) throw new Error('Quantidade por item deve ser 1.');
  return items.map(({ variantId, lotId, risk }) => ({ variant_id: variantId, lot_id: lotId, risk: risk ?? '', quantity: UNIT_QUANTITY }));
}
