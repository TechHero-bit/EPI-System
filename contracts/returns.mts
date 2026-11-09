// Motivos de devolução (M.D.) da legenda do modelo da ficha da empresa
// (MODELO FICHA DE EPI 2026.xlsx). Keep migration 012 in sync.
// O código 12 ("1ª Entrega") descreve uma entrega e não é aceito em devoluções.
export const RETURN_REASONS = [
  { code: 1, label: "Quebrou" },
  { code: 2, label: "Deslocou" },
  { code: 3, label: "Sujou" },
  { code: 4, label: "Amassou" },
  { code: 5, label: "Rasgou" },
  { code: 6, label: "Arrebentou" },
  { code: 7, label: "Endureceu" },
  { code: 8, label: "Saturou" },
  { code: 9, label: "Furou" },
  { code: 10, label: "Extraviou" },
  { code: 11, label: "Venceu" },
  { code: 13, label: "Desligamento" },
  { code: 14, label: "Não utilizado" },
] as const;
export const TERMINATION_REASON = 13;
export const RETURN_DESTINATIONS = [
  { id: "RESTOCK", label: "Volta ao estoque" },
  { id: "DISCARD", label: "Baixa como descarte/avaria" },
] as const;
export type ReturnDestination = (typeof RETURN_DESTINATIONS)[number]["id"];
export const isReturnReason = (code: unknown): code is number =>
  RETURN_REASONS.some((r) => r.code === code);
export const returnReasonLabel = (code: number) =>
  RETURN_REASONS.find((r) => r.code === code)?.label ?? String(code);
/** Fichas cujo estoque já foi baixado aceitam devolução. */
export const RETURNABLE_RESERVATION_STATUS = ["DELIVERED", "LEGACY_ISSUED"] as const;
