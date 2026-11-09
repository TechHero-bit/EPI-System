// The demo uses the same portable document service as the real API.
export async function demoDocument(
  sheet: any,
  kind: "pdf" | "xlsx",
): Promise<Blob> {
  if (!sheet) throw new Error("Ficha não encontrada.");
  const { renderPdf, renderXlsx, renderPrintablePdf } = await import(
    "../../../../../Backend/src/services/document.service"
  );
  const s = sheet.snapshot,
    employee = s.employee;
  const snapshot = {
    ...s,
    employee: {
      name: employee.name,
      registration: employee.registration,
      jobTitle: employee.jobTitle ?? employee.job_title,
      department: employee.department,
      admissionDate: employee.admissionDate ?? employee.admission_date,
      terminationDate:
        employee.terminationDate ?? employee.termination_date ?? null,
    },
    issuedAt: s.issuedAt ?? sheet.issued_at,
    recordNumber: s.recordNumber ?? sheet.record_number,
    requestKey: sheet.request_key,
    demonstration: true,
    returns: (sheet.returns ?? []).flatMap((r: any) =>
      r.items.map((i: any) => ({
        index: i.item_index,
        date: r.returned_on,
        reasonCode: i.reason_code,
      })),
    ),
    items: s.items.map((i: any) => ({
      ...i,
      date: i.date ?? s.documentDate,
      brand: i.brand ?? "",
      risk: i.risk ?? "",
    })),
  };
  const signature = sheet.electronic_signature;
  let bytes: Uint8Array;
  if (kind === "pdf") {
    bytes = await renderPrintablePdf(await renderPdf(snapshot), snapshot, signature);
  } else bytes = await renderXlsx(snapshot, signature);
  return new Blob([new Uint8Array(bytes)], {
    type:
      kind === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
