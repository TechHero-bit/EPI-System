import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import ExcelJS from "exceljs";
import { companyModel } from "../assets/company-model.js";
import type { SheetSnapshot } from "./document.service.js";

const bytes = (base64: string) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
const dateBR = (value: string) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "";
const dateValue = (value: string) =>
  value ? new Date(`${value.slice(0, 10)}T12:00:00Z`) : null;
const issueDate = (value: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(value),
  );
export const companyHeaders = [
  "Data da Entrega",
  "Qtd.",
  "Descrição do E.P.I.",
  "C.A.",
  "Marca",
  "Risco",
];

export async function renderCompanyPdf(s: SheetSnapshot): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(companyModel.title);
  pdf.setAuthor("Centauro");
  pdf.setCreationDate(new Date(s.issuedAt));
  const regular = await pdf.embedFont(StandardFonts.TimesRoman),
    bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const logo = await pdf.embedPng(bytes(companyModel.logoBase64));
  let page = pdf.addPage([842, 595]);
  const ink = rgb(0, 0, 0),
    line = rgb(0.35, 0.35, 0.35),
    columns = [20, 112, 146, 514, 588, 744, 822];
  const clean = (value: string) =>
    value
      .normalize("NFC")
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[\r\n\t]/g, " ");
  const wrapped = (value: string, width: number, size = 9, strong = false) => {
    const font = strong ? bold : regular,
      lines: string[] = [];
    let current = "";
    for (const word of clean(value).split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = "";
      for (const char of word) {
        if (current && font.widthOfTextAtSize(current + char, size) > width) {
          lines.push(current);
          current = "";
        }
        current += char;
      }
    }
    if (current || !lines.length) lines.push(current);
    return lines;
  };
  const text = (
    value: string,
    x: number,
    y: number,
    size = 9,
    strong = false,
  ) =>
    page.drawText(clean(value), {
      x,
      y,
      size,
      font: strong ? bold : regular,
      color: ink,
    });
  const paragraph = (
    value: string,
    x: number,
    y: number,
    width: number,
    size = 9,
    strong = false,
    leading = size + 1,
  ) => {
    const lines = wrapped(value, width, size, strong);
    lines.forEach((v, n) => text(v, x, y - leading * n, size, strong));
    return y - leading * lines.length;
  };
  const rule = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: 0.6,
      color: line,
    });
  const field = (
    value: string,
    x: number,
    y: number,
    width: number,
    height: number,
    preferred = 9.5,
    strong = false,
  ) => {
    let size = preferred;
    while (
      size > 5 &&
      wrapped(value, width, size, strong).length * (size + 1) > height
    )
      size -= 0.25;
    paragraph(value, x, y, width, size, strong, size + 1);
  };
  const header = () => {
    page.drawRectangle({
      x: 20,
      y: 20,
      width: 802,
      height: 555,
      borderColor: line,
      borderWidth: 0.8,
    });
    page.drawImage(logo, { x: 34, y: 537, width: 156, height: 36.3 });
    text(companyModel.safety, 225, 552, 9.5, true);
    text(companyModel.title, 484, 552, 10, true);
    rule(210, 535, 210, 575);
    rule(474, 535, 474, 575);
    rule(20, 535, 822, 535);
    text("Funcionário(a):", 30, 517, 9, true);
    field(s.employee.name, 108, 517, 220, 32, 9.5, true);
    text("Nº de Registro:", 342, 517, 9, true);
    field(s.employee.registration, 342, 502, 115, 43, 10, true);
    text("Função:", 30, 474, 9, true);
    field(s.employee.jobTitle, 76, 474, 250, 32);
    text(`Data da Admissão: ${dateBR(s.employee.admissionDate)}`, 30, 434, 9);
    text(
      `Data da Demissão: ${dateBR(s.employee.terminationDate ?? "")}`,
      252,
      434,
      9,
    );
    rule(474, 417, 474, 535);
    text("Risco", 620, 520, 9, true);
    let legendY = 505;
    for (const legend of companyModel.riskLegend) {
      legendY = paragraph(legend, 484, legendY, 327, 8.3, false, 9) - 4;
    }
    rule(20, 417, 822, 417);
    text("DECLARAÇÃO DE RECEBIMENTO", 316, 403, 10.5, true);
    const end = paragraph(
      companyModel.declaration,
      30,
      389,
      782,
      8.1,
      false,
      9.3,
    );
    paragraph(
      companyModel.instructions,
      30,
      Math.min(306, end - 5),
      782,
      8.1,
      false,
      9.3,
    );
    rule(20, 285, 822, 285);
    text(
      `${companyModel.location}, ${dateBR(issueDate(s.issuedAt))}`,
      105,
      269,
      10,
    );
    text("Local e Data", 205, 252, 8.5, true);
    rule(20, 260, 822, 260);
    rule(430, 245, 430, 285);
    text("Assinatura do Colaborador", 555, 252, 8.5, true);
    rule(20, 245, 822, 245);
    page.drawRectangle({
      x: 20,
      y: 224,
      width: 802,
      height: 21,
      color: rgb(0.86, 0.86, 0.86),
    });
    companyHeaders.forEach((h, i) =>
      text(h, columns[i]! + 4, 232, i === 0 ? 8.5 : 9, true),
    );
    rule(20, 224, 822, 224);
    text(
      s.demonstration
        ? "DEMONSTRAÇÃO - DADOS FICTÍCIOS - SEM VALIDADE JURÍDICA"
        : "Assinatura e confirmação da entrega física são eventos independentes.",
      28,
      28,
      7.5,
    );
  };
  header();
  let top = 224;
  const finish = () => {
    while (top - 17 >= 43) {
      top -= 17;
      rule(20, top, 822, top);
    }
    for (const x of columns.slice(1, -1)) rule(x, 245, x, top);
  };
  for (const item of s.items) {
    const values = [
      dateBR(item.date),
      "1",
      item.description,
      item.ca,
      item.brand,
      item.risk,
    ];
    const lines = values.map((v, i) =>
      wrapped(v, columns[i + 1]! - columns[i]! - 8, 9),
    );
    const height = Math.max(17, ...lines.map((row) => row.length * 10 + 6));
    if (top - height < 43) {
      finish();
      page = pdf.addPage([842, 595]);
      header();
      top = 224;
    }
    lines.forEach((row, i) =>
      row.forEach((value, n) =>
        text(value, columns[i]! + 4, top - 12 - n * 10, 9),
      ),
    );
    top -= height;
    rule(20, top, 822, top);
  }
  finish();
  pdf.getPages().forEach((p, i) =>
    p.drawText(`${i + 1}/${pdf.getPageCount()}`, {
      x: 790,
      y: 28,
      size: 7,
      font: regular,
      color: ink,
    }),
  );
  return pdf.save();
}

export async function renderCompanyXlsx(s: SheetSnapshot): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes(companyModel.workbookBase64) as any);
  book.creator = "Centauro";
  book.lastModifiedBy = "EPI System";
  book.created = new Date(s.issuedAt);
  book.modified = new Date(s.issuedAt);
  const ws = book.worksheets[0]!;
  ws.name = "Ficha EPI";
  ws.getColumn("G").hidden = false;
  ws.getCell("A7").value = s.employee.name;
  ws.getCell("E7").value = s.employee.registration;
  ws.getCell("E7").numFmt = "@";
  ws.getRow(7).height = Math.max(
    18,
    Math.ceil(s.employee.name.length / 32) * 15,
    Math.ceil(s.employee.registration.length / 18) * 15,
  );
  ws.getCell("A8").value = `Função: ${s.employee.jobTitle}`;
  ws.getRow(8).height = Math.max(
    18,
    Math.ceil(s.employee.jobTitle.length / 50) * 15,
  );
  ws.getCell("A11").value = dateValue(s.employee.admissionDate);
  ws.getCell("A11").numFmt = "dd/mm/yyyy";
  ws.getCell("D11").value = dateValue(s.employee.terminationDate ?? "");
  ws.getCell("D11").numFmt = "dd/mm/yyyy";
  ws.unMergeCells("A17:F17");
  ws.mergeCells("A17:D17");
  ws.mergeCells("E17:F17");
  ws.getCell("A17").value = companyModel.location;
  ws.getCell("E17").value = dateValue(issueDate(s.issuedAt));
  ws.getCell("E17").numFmt = "dd/mm/yyyy";
  for (const cell of ["A7", "E7", "A8", "A11", "D11", "A17", "E17"]) {
    ws.getCell(cell).font = { name: "Times New Roman", size: 11 };
    ws.getCell(cell).alignment = { vertical: "middle", wrapText: true };
  }
  const count = Math.max(10, s.items.length),
    masters = ["A", "B", "C", "G", "I", "M"];
  for (let index = 0; index < count; index++) {
    const item = s.items[index],
      row = 20 + index;
    if (row > 29) {
      // The supplied workbook also contains merged blank rows beyond its print area.
      ws.unMergeCells(`A${row}:O${row}`);
      for (let column = 1; column <= 15; column++)
        ws.getCell(row, column).style = structuredClone(
          ws.getCell(20, column).style,
        );
      for (const [start, end] of [
        [3, 6],
        [7, 8],
        [9, 12],
        [13, 15],
      ])
        ws.mergeCells(row, start!, row, end!);
    }
    const values = item
      ? [
          dateValue(item.date),
          1,
          item.description,
          item.ca,
          item.brand,
          item.risk,
        ]
      : [null, null, null, null, null, null];
    masters.forEach((column, c) => {
      const cell = ws.getCell(`${column}${row}`);
      cell.value = values[c] as any;
      cell.style = structuredClone(cell.style);
      cell.numFmt = c === 0 ? "dd/mm/yyyy" : c === 1 ? "0" : "@";
      cell.font = { name: "Times New Roman", size: 11 };
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: c === 1 ? "center" : "left",
      };
    });
    ws.getRow(row).height = item
      ? Math.max(
          20,
          Math.ceil(item.description.length / 40) * 15,
          Math.ceil(item.brand.length / 16) * 15,
          Math.ceil(item.ca.length / 10) * 15,
          Math.ceil(item.risk.length / 20) * 15,
        )
      : 20;
  }
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A2:O${19 + count}`,
    printTitlesRow: "2:19",
    margins: {
      left: 0.2,
      right: 0.2,
      top: 0.2,
      bottom: 0.3,
      header: 0,
      footer: 0.15,
    },
  };
  ws.headerFooter = {
    oddFooter: `&L${s.demonstration ? "DEMONSTRAÇÃO - SEM VALIDADE JURÍDICA" : "Assinatura não confirma entrega física."}&RPágina &P de &N`,
  };
  return new Uint8Array(await book.xlsx.writeBuffer());
}
