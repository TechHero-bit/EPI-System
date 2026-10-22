import type { DraftItem } from "../../core/models/portal.model";

// Reopen as a NEW draft; never modify the prepared document or copy catalog overrides.
export function restoreReviewDraft(sheet: any): {
  employeeId: string;
  date: string;
  method: string;
  items: DraftItem[];
} {
  const snapshot = sheet?.snapshot;
  const rows = snapshot?.items;
  const date = snapshot?.documentDate;
  const method = sheet?.signature_method ?? snapshot?.method;
  if (
    !sheet?.employee_id ||
    !Array.isArray(rows) ||
    !rows.length ||
    rows.length > 15 ||
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !["MANUAL", "ELECTRONIC"].includes(method)
  )
    throw new Error(
      "Não foi possível recuperar os dados desta revisão. A versão existente foi preservada.",
    );
  return {
    employeeId: sheet.employee_id,
    date,
    method,
    items: rows.map((row: any, index: number) => {
      const source = sheet.items?.[index];
      const variantId =
        row.variantId ??
        row.variant_id ??
        source?.variantId ??
        source?.variant_id;
      if (!variantId || (row.quantity !== undefined && row.quantity !== 1))
        throw new Error(
          "Não foi possível recuperar o equipamento desta revisão. A versão existente foi preservada.",
        );
      return {
        variantId,
        quantity: 1,
        deliveryDate: row.date ?? source?.deliveryDate ?? date,
      };
    }),
  };
}
