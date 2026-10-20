export async function demoDocument(
  sheet: any,
  kind: "pdf" | "xlsx",
): Promise<Blob> {
  if (!sheet) throw new Error("Ficha não encontrada.");
  const employee = sheet.snapshot.employee;
  const items = sheet.snapshot.items;
  if (kind === "pdf") {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([842, 595]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const text = (value: string, y: number, size = 12) =>
      page.drawText(
        value
          .normalize("NFKD")
          .replace(/[^\x20-\x7E]/g, "")
          .slice(0, 120),
        { x: 40, y, size, font, color: rgb(0.1, 0.18, 0.3) },
      );
    text("DEMONSTRACAO - SEM VALIDADE JURIDICA", 548, 19);
    text("Ficha de EPI | modelo provisorio", 520, 14);
    text(`Identificador: ${sheet.id} | Versao ${sheet.version}`, 490, 10);
    text(
      `Colaborador: ${employee.name} | Matricula: ${employee.registration}`,
      466,
    );
    text(`Cargo: ${employee.job_title} | Setor: ${employee.department}`, 444);
    text("Equipamentos destinados ao colaborador (1 unidade por linha)", 410);
    items.forEach((i: any, n: number) =>
      text(
        `1 un. | ${i.description} | CA ${i.ca ?? "-"} | Tam. ${i.size} | Lote ${i.lot}`,
        385 - n * 17,
        10,
      ),
    );
    text("Assinatura e entrega fisica possuem estados separados.", 75, 10);
    text(
      "Dados ficticios. Documento original ainda necessario para validar o modelo.",
      55,
      10,
    );
    return new Blob([new Uint8Array(await pdf.save())], {
      type: "application/pdf",
    });
  }
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("DEMONSTRAÇÃO");
  ws.addRow(["DEMONSTRAÇÃO - SEM VALIDADE JURÍDICA"]);
  ws.addRow(["Ficha", sheet.id, "Versão", sheet.version]);
  ws.addRow(["Colaborador", employee.name, "Matrícula", employee.registration]);
  ws.addRow(["Modelo provisório; assinatura e entrega física independentes"]);
  ws.addRow(["Descrição", "CA", "Tamanho", "Lote", "Quantidade"]);
  for (const i of items) ws.addRow([i.description, i.ca, i.size, i.lot, 1]);
  ws.columns.forEach((c) => (c.width = 28));
  return new Blob([new Uint8Array(await workbook.xlsx.writeBuffer())], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
