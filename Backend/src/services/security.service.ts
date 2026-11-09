import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import { normalizeSignerName } from "../../../contracts/signature.mjs";

export const UNIT_QUANTITY = 1 as const;
export const token = () => randomBytes(32).toString("base64url");
export const otp = () => randomInt(0, 1_000_000).toString().padStart(6, "0");
export const sha256 = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
export const secretHash = (value: string, pepper: string) =>
  createHmac("sha256", pepper).update(value).digest("hex");
export function secretEquals(value: string, expected: string, pepper: string) {
  const a = Buffer.from(secretHash(value, pepper), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unitItems(
  items: Array<{
    variantId: string;
    quantity?: number;
  }>,
) {
  if (!items.length) throw new Error("Escolha ao menos um EPI.");
  for (const item of items)
    if (item.quantity !== undefined && item.quantity !== 1)
      throw new Error("Quantidade por item deve ser 1.");
  return items.map(({ variantId }) => ({
    variant_id: variantId,
    risk: "",
    quantity: UNIT_QUANTITY,
  }));
}

/**
 * Confirma o signatário pelo nome completo e pelos 3 primeiros e 3 últimos dígitos
 * do CPF cadastrado. Compara HMACs de tamanho fixo em tempo constante e não informa
 * qual campo falhou. Nunca registre nem devolva o CPF ou parte dele.
 */
export function signerIdentityMatches(
  given: { name: string; cpfStart?: string; cpfEnd?: string },
  expected: { name: string; cpf: string },
  pepper: string,
) {
  const digits = expected.cpf.replace(/\D/g, "");
  const a = secretHash(
    `${normalizeSignerName(given.name)}|${given.cpfStart ?? ""}|${given.cpfEnd ?? ""}`,
    pepper,
  );
  const b = secretHash(
    `${normalizeSignerName(expected.name)}|${digits.slice(0, 3)}|${digits.slice(-3)}`,
    pepper,
  );
  return (
    timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex")) &&
    digits.length === 11
  );
}
