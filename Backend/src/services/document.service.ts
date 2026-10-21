import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import ExcelJS from "exceljs";

// Portable renderer used by the API and the browser demo.
export type SheetItem = {
  date: string;
  description: string;
  ca: string;
  brand: string;
  risk: string;
  size: string;
  lot: string;
  variantId: string;
  lotId: string;
  quantity: 1;
};
export type SheetSnapshot = {
  employee: {
    name: string;
    registration: string;
    jobTitle: string;
    department: string;
    admissionDate: string;
    terminationDate: string | null;
  };
  recordNumber?: number;
  issuedAt: string;
  documentDate: string; // Default delivery date, not the generation date.
  method: "MANUAL" | "ELECTRONIC";
  items: SheetItem[];
  template: "PROVISIONAL_FROM_IMAGE_V1" | "EPI_RECEIPT_V2";
  requestKey?: string;
  organizationName?: string;
  demonstration?: boolean;
};
export const generationDate = (timestamp: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(timestamp),
  );
const dateBR = (value: string) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "";
const dateValue = (value: string) =>
  value ? new Date(`${value.slice(0, 10)}T12:00:00Z`) : null;
const declaration =
  "Os equipamentos relacionados destinam-se ao funcionário indicado. A assinatura e a confirmação da entrega física são registradas separadamente. Observe as orientações de uso e conservação recebidas da empresa.";
export const sheetHeaders = [
  "Data da Entrega",
  "Qtd.",
  "Descrição de E.P.I.",
  "C.A.",
  "Marca",
  "Risco",
];

export async function renderPdf(s: SheetSnapshot): Promise<Uint8Array> {
  if (s.items.length > 15) throw new Error("Limite de 15 itens por ficha.");
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([842, 595]);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.15),
    line = rgb(0.45, 0.47, 0.5);
  const clean = (value: string) =>
    value.replace(/[\r\n\t]/g, " ").replace(/[^\x20-\x7e\u00a0-\u00ff]/g, "-");
  const text = (
    value: string,
    x: number,
    y: number,
    width: number,
    size = 9,
    strong = false,
  ) => {
    const font = strong ? bold : normal;
    let content = clean(value);
    const measured = font.widthOfTextAtSize(content, size);
    const fitted =
      measured > width ? Math.max(6, (size * width) / measured) : size;
    page.drawText(content, { x, y, size: fitted, font, color: ink });
  };
  const wrap = (value: string, width: number): string[] => {
    const lines: string[] = [];
    let current = "";
    for (const char of clean(value)) {
      if (normal.widthOfTextAtSize(current + char, 9) > width && current) {
        lines.push(current);
        current = "";
      }
      current += char;
    }
    if (current || !lines.length) lines.push(current);
    return lines;
  };
  const rule = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: 0.6,
      color: line,
    });
  const cols = [20, 118, 155, 502, 591, 733, 822];
  const header = () => {
    page.drawRectangle({
      x: 20,
      y: 20,
      width: 802,
      height: 555,
      borderColor: line,
      borderWidth: 1,
    });
    text(s.organizationName || "Empresa / unidade", 30, 551, 224, 12, true);
    text("SEGURANÇA E MEDICINA DO TRABALHO", 267, 553, 275, 9, true);
    text("COMPROVANTE DE FORNECIMENTO (E.P.I.)", 551, 553, 261, 10, true);
    rule(258, 533, 258, 575);
    rule(542, 533, 542, 575);
    rule(20, 533, 822, 533);
    text(`Funcionário(a): ${s.employee.name}`, 30, 510, 560, 10, true);
    text(
      `Nº de Registro: ${s.recordNumber ?? "Histórico sem número"}`,
      610,
      510,
      202,
      10,
      true,
    );
    text(`Função: ${s.employee.jobTitle}`, 30, 487, 782, 10);
    text(
      `Data da Admissão: ${dateBR(s.employee.admissionDate)}`,
      30,
      464,
      370,
      10,
    );
    text(
      `Data da Demissão: ${dateBR(s.employee.terminationDate ?? "")}`,
      430,
      464,
      382,
      10,
    );
    rule(20, 450, 822, 450);
    text("DECLARAÇÃO DE RECEBIMENTO", 302, 432, 470, 11, true);
    const words = declaration.split(" ");
    let current = "",
      y = 411;
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (normal.widthOfTextAtSize(next, 9) > 780) {
        text(current, 30, y, 782);
        y -= 13;
        current = word;
      } else current = next;
    }
    text(current, 30, y, 782);
    text(
      `Data de geração: ${dateBR(generationDate(s.issuedAt))}`,
      30,
      362,
      350,
      10,
    );
    text(
      "Assinatura do Colaborador: __________________________________",
      430,
      362,
      382,
      9,
    );
    rule(20, 349, 822, 349);
    page.drawRectangle({
      x: 20,
      y: 325,
      width: 802,
      height: 24,
      color: rgb(0.94, 0.94, 0.94),
    });
    sheetHeaders.forEach((h, i) =>
      text(h, cols[i]! + 5, 333, cols[i + 1]! - cols[i]! - 10, 9, true),
    );
    rule(20, 325, 822, 325);
    text(
      s.demonstration
        ? "DEMONSTRAÇÃO - DADOS FICTÍCIOS - SEM VALIDADE JURÍDICA"
        : "Registro de assinatura não substitui a confirmação da entrega física.",
      30,
      32,
      782,
      8,
    );
  };
  header();
  let top = 325;
  const finish = () => {
    while (top - 18 >= 51) {
      top -= 18;
      rule(20, top, 822, top);
    }
    for (const x of cols.slice(1, -1)) rule(x, 349, x, top);
  };
  for (const it of s.items) {
    const cells = [
      dateBR(it.date),
      "1",
      it.description,
      it.ca,
      it.brand,
      it.risk,
    ].map((v, i) => wrap(v, cols[i + 1]! - cols[i]! - 10));
    const height = Math.max(18, ...cells.map((lines) => lines.length * 10 + 7));
    if (top - height < 51) {
      finish();
      page = pdf.addPage([842, 595]);
      header();
      top = 325;
    }
    cells.forEach((lines, i) =>
      lines.forEach((value, n) =>
        text(
          value,
          cols[i]! + 5,
          top - 13 - n * 10,
          cols[i + 1]! - cols[i]! - 10,
          9,
        ),
      ),
    );
    top -= height;
    rule(20, top, 822, top);
  }
  finish();
  return pdf.save();
}

export async function renderXlsx(s: SheetSnapshot): Promise<Uint8Array> {
  if (s.items.length > 15) throw new Error("Limite de 15 itens por ficha.");
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet("Ficha EPI", {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      printArea: "A1:F30",
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.3,
        bottom: 0.3,
        header: 0,
        footer: 0,
      },
    },
  });
  ws.columns = [
    { width: 19 },
    { width: 8 },
    { width: 61 },
    { width: 16 },
    { width: 25 },
    { width: 13 },
  ];
  const merge = (range: string, value: string) => {
    ws.mergeCells(range);
    ws.getCell(range.split(":")[0]!).value = value;
  };
  merge("A1:B2", s.organizationName || "Empresa / unidade");
  merge("C1:C2", "SEGURANÇA E MEDICINA DO TRABALHO");
  merge("D1:F2", "COMPROVANTE DE FORNECIMENTO (E.P.I.)");
  merge("A3:D3", `Funcionário(a): ${s.employee.name}`);
  merge("E3:F3", `Nº de Registro: ${s.recordNumber ?? "Histórico sem número"}`);
  merge("A4:F4", `Função: ${s.employee.jobTitle}`);
  merge("A5:C5", "Data da Admissão");
  merge("D5:F5", "Data da Demissão");
  ws.mergeCells("A6:C6");
  ws.getCell("A6").value = dateValue(s.employee.admissionDate);
  ws.mergeCells("D6:F6");
  ws.getCell("D6").value = dateValue(s.employee.terminationDate ?? "");
  merge("A8:F8", "DECLARAÇÃO DE RECEBIMENTO");
  merge("A9:F10", declaration);
  merge("A11:B11", "Data de geração");
  ws.getCell("C11").value = dateValue(generationDate(s.issuedAt));
  merge("D11:F11", "Assinatura do Colaborador: __________________________");
  ws.getRow(13).values = sheetHeaders;
  for (let i = 0; i < 15; i++) {
    const it = s.items[i];
    ws.getRow(14 + i).values = it
      ? [dateValue(it.date), 1, it.description, it.ca, it.brand, it.risk]
      : [null, null, null, null, null, null];
  }
  merge(
    "A30:F30",
    s.demonstration
      ? "DEMONSTRAÇÃO - DADOS FICTÍCIOS - SEM VALIDADE JURÍDICA"
      : "Assinatura e confirmação da entrega física são eventos independentes.",
  );
  for (let r = 1; r <= 30; r++) {
    const row = ws.getRow(r);
    const it = s.items[r - 14];
    const heights = it
      ? [
          it.description.length / 57,
          it.ca.length / 14,
          it.brand.length / 23,
          it.risk.length / 11,
        ].map((n) => Math.ceil(n) * 13 + 6)
      : [25];
    row.height = r >= 14 && r <= 28 ? Math.max(25, ...heights) : 22;
    for (let c = 1; c <= 6; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Arial", size: 10, bold: [1, 2, 8, 13].includes(r) };
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: [1, 2, 8, 13].includes(r)
          ? "center"
          : c === 2 && r >= 14
            ? "right"
            : "left",
      };
      if (r === 13)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE5E5E5" },
        };
      if (r >= 13 && r <= 28)
        cell.border = {
          bottom: { style: "thin", color: { argb: "FF999999" } },
          left: { style: "thin", color: { argb: "FF999999" } },
          right: { style: "thin", color: { argb: "FF999999" } },
        };
      if (cell.value instanceof Date) cell.numFmt = "dd/mm/yyyy";
      else if (r >= 14 && r <= 28 && c >= 3) cell.numFmt = "@";
    }
  }
  ws.getRow(30).font = { name: "Arial", size: 9, italic: true };
  return new Uint8Array(await book.xlsx.writeBuffer());
}
