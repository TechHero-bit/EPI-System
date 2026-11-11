// Níveis de alerta da validade do C.A. Compartilhado pela API, demonstração e telas.
// Quanto menos dias, mais destaque; a interface sempre mostra o texto além da cor.
export const CA_ALERT_LEVELS = [
  { id: "EXPIRED", label: "C.A. vencido", maxDays: -1, severity: "CRITICAL" },
  { id: "D7", label: "Vence em até 7 dias", maxDays: 7, severity: "CRITICAL" },
  { id: "D15", label: "Vence em até 15 dias", maxDays: 15, severity: "WARNING" },
  { id: "D30", label: "Vence em até 30 dias", maxDays: 30, severity: "NORMAL" },
] as const;
export type CaAlertLevel = (typeof CA_ALERT_LEVELS)[number]["id"];

// Três faixas de cor para leitura rápida: prioridade (vencido ou até 7 dias),
// atenção (até 15 dias) e vigente (até 30 dias, só acompanhamento).
// `title` nomeia a faixa em resumos e filtros; `label` acompanha cada item.
export const CA_SEVERITIES = [
  { id: "CRITICAL", title: "CA em situação crítica", label: "Prioridade" },
  { id: "WARNING", title: "CA em atenção", label: "Atenção" },
  { id: "NORMAL", title: "CA vigente", label: "Vigente" },
] as const;
export type CaSeverity = (typeof CA_SEVERITIES)[number]["id"];
export const caSeverity = (level: CaAlertLevel | null | undefined): CaSeverity | null =>
  level ? CA_ALERT_LEVELS.find((l) => l.id === level)!.severity : null;
export const caSeverityLabel = (severity: CaSeverity) =>
  CA_SEVERITIES.find((s) => s.id === severity)!.label;

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Dias até o vencimento (negativo quando vencido). Datas ISO AAAA-MM-DD. */
export const daysUntil = (expiresAt: string, today: string) =>
  Math.round((day(expiresAt) - day(today)) / 86_400_000);

/** O C.A. continua válido no próprio dia do vencimento, como em issue_sheet. */
export function caAlertLevel(
  expiresAt: string | null | undefined,
  today: string,
): CaAlertLevel | null {
  if (!expiresAt || !/^\d{4}-\d{2}-\d{2}/.test(expiresAt)) return null;
  const days = daysUntil(expiresAt.slice(0, 10), today);
  if (days < 0) return "EXPIRED";
  if (days <= 7) return "D7";
  if (days <= 15) return "D15";
  if (days <= 30) return "D30";
  return null;
}
export const caAlertLabel = (level: CaAlertLevel) =>
  CA_ALERT_LEVELS.find((l) => l.id === level)!.label;
