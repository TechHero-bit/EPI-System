import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import ExcelJS from "exceljs";

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
  issuedAt: string;
  documentDate: string;
  method: "MANUAL" | "ELECTRONIC";
  items: SheetItem[];
  template: "PROVISIONAL_FROM_IMAGE_V1";
  requestKey?: string;
  organizationName?: string;
};

const short = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;
const dateBR = (date: string) =>
  date
    ? new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", {
        timeZone: "UTC",
      })
    : "";

export async function renderPdf(s: SheetSnapshot): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.16, 0.22);
  const line = rgb(0.55, 0.59, 0.64);
  const muted = rgb(0.35, 0.42, 0.48);
  const txt = (
    value: string,
    x: number,
    y: number,
    size = 9,
    strong = false,
    color = ink,
  ) =>
    page.drawText(value.replaceAll("…", "..."), {
      x,
      y,
      size,
      font: strong ? bold : regular,
      color,
    });
  const rule = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: 0.7,
      color: line,
    });
  page.drawRectangle({
    x: 20,
    y: 20,
    width: 802,
    height: 555,
    borderColor: line,
    borderWidth: 1,
  });
  txt("COMPROVANTE DE FORNECIMENTO DE E.P.I.", 220, 548, 15, true);
  txt(
    "MODELO PROVISÓRIO - validar com o PDF original antes de uso oficial",
    220,
    532,
    8,
    false,
    muted,
  );
  txt(
    short(s.organizationName ?? "Empresa / unidade não informada", 35),
    30,
    555,
    7,
  );
  txt(`Doc.: ${s.requestKey ?? "Teste"}`, 30, 540, 6);
  rule(20, 520, 822, 520);
  txt(`Funcionário(a): ${short(s.employee.name, 49)}`, 30, 499, 10, true);
  txt(`Nº de registro: ${s.employee.registration}`, 625, 499, 9);
  txt(`Função: ${short(s.employee.jobTitle, 50)}`, 30, 481, 9);
  txt(`Setor: ${short(s.employee.department, 40)}`, 440, 481, 9);
  txt(`Admissão: ${dateBR(s.employee.admissionDate)}`, 30, 463, 9);
  txt(
    `Demissão: ${s.employee.terminationDate ? dateBR(s.employee.terminationDate) : "—"}`,
    250,
    463,
    9,
  );
  rule(20, 449, 822, 449);
  txt("DECLARAÇÃO DE RECEBIMENTO", 311, 430, 11, true);
  txt(
    "A seleção abaixo identifica os equipamentos destinados ao colaborador. A confirmação do recebimento",
    30,
    413,
    8,
  );
  txt(
    "físico e a assinatura são registradas separadamente. Siga as orientações de uso e conservação da empresa.",
    30,
    401,
    8,
  );
  txt(
    `Data indicada pelo RH: ${dateBR(s.documentDate)}  |  Modalidade: ${s.method === "MANUAL" ? "Assinatura presencial/manual" : "Assinatura eletrônica opcional"}`,
    30,
    377,
    9,
  );
  txt(
    "Assinatura do colaborador (se manual): __________________________________________",
    30,
    353,
    9,
  );
  txt("Data: ____/____/________", 645, 353, 9);
  rule(20, 340, 822, 340);
  const cols = [20, 105, 140, 410, 475, 575, 635, 692, 822];
  const headers = [
    "Data prevista",
    "Qtd.",
    "Descrição de E.P.I.",
    "C.A.",
    "Marca",
    "Tam.",
    "Risco",
    "Lote",
  ];
  headers.forEach((h, i) => txt(h, cols[i]! + 4, 323, 7.5, true));
  rule(20, 313, 822, 313);
  for (let i = 0; i < Math.min(s.items.length, 15); i++) {
    const it = s.items[i]!;
    const y = 297 - i * 17;
    [
      dateBR(it.date),
      "1",
      short(it.description, 42),
      short(it.ca, 11),
      short(it.brand, 15),
      short(it.size, 8),
      short(it.risk, 8),
      short(it.lot, 18),
    ].forEach((v, j) => txt(v, cols[j]! + 4, y, 7.5));
    rule(20, y - 5, 822, y - 5);
  }
  for (const x of cols.slice(1, -1)) rule(x, 340, x, 37);
  txt(
    "Sem rubrica por linha, data de devolução ou M.D. Nesta versão, esses dados não compõem a montagem.",
    28,
    27,
    7,
    false,
    muted,
  );
  return pdf.save();
}

export async function renderXlsx(s: SheetSnapshot): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet("Ficha EPI", {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
    },
  });
  ws.columns = [
    { width: 17 },
    { width: 8 },
    { width: 43 },
    { width: 14 },
    { width: 21 },
    { width: 14 },
    { width: 12 },
    { width: 22 },
  ];
  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = "COMPROVANTE DE FORNECIMENTO DE E.P.I.";
  ws.mergeCells("A2:H2");
  ws.getCell("A2").value =
    "MODELO PROVISÓRIO - validar com o PDF original antes de uso oficial";
  ws.mergeCells("A3:H3");
  ws.getCell("A3").value =
    `${s.organizationName ?? ""} | Documento ${s.requestKey ?? "Teste"}`;
  ws.mergeCells("A4:D4");
  ws.getCell("A4").value = `Funcionário(a): ${s.employee.name}`;
  ws.mergeCells("E4:H4");
  ws.getCell("E4").value = `Nº de registro: ${s.employee.registration}`;
  ws.mergeCells("A5:D5");
  ws.getCell("A5").value = `Função: ${s.employee.jobTitle}`;
  ws.mergeCells("E5:H5");
  ws.getCell("E5").value = `Setor: ${s.employee.department}`;
  ws.mergeCells("A6:D6");
  ws.getCell("A6").value = `Admissão: ${dateBR(s.employee.admissionDate)}`;
  ws.mergeCells("E6:H6");
  ws.getCell("E6").value =
    `Demissão: ${s.employee.terminationDate ? dateBR(s.employee.terminationDate) : ""}`;
  ws.mergeCells("A8:H8");
  ws.getCell("A8").value = "DECLARAÇÃO DE RECEBIMENTO";
  ws.mergeCells("A9:H9");
  ws.getCell("A9").value =
    "A assinatura e a confirmação do recebimento físico são registradas separadamente.";
  ws.mergeCells("A11:H11");
  ws.getCell("A11").value =
    `Data indicada pelo RH: ${dateBR(s.documentDate)} | ${s.method === "MANUAL" ? "Assinatura presencial/manual" : "Assinatura eletrônica opcional"}`;
  ws.mergeCells("A12:H12");
  ws.getCell("A12").value =
    "Assinatura do colaborador (se manual): _______________________________________________";
  ws.addRow([]);
  ws.addRow([
    "Data prevista",
    "Qtd.",
    "Descrição de E.P.I.",
    "C.A.",
    "Marca",
    "Tamanho",
    "Risco",
    "Lote",
  ]);
  for (const it of s.items)
    ws.addRow([
      dateBR(it.date),
      1,
      it.description,
      it.ca,
      it.brand,
      it.size,
      it.risk,
      it.lot,
    ]);
  for (const row of ws.getRows(1, ws.rowCount) ?? []) {
    row.height = row.number === 1 ? 25 : 20;
    row.eachCell((cell) => {
      cell.font = {
        name: "Arial",
        size: row.number === 1 ? 14 : 10,
        bold: [1, 8, 14].includes(row.number),
      };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (row.number >= 14)
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFB8BEC6" } },
        };
    });
  }
  ws.getRow(14).height = 25;
  const bytes = await book.xlsx.writeBuffer();
  return Buffer.from(bytes);
}
