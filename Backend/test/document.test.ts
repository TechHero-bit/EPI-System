import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  renderPdf,
  renderXlsx,
  generationDate,
  sheetHeaders,
  type SheetSnapshot,
} from "../src/services/document.service.js";
import ExcelJS from "exceljs";
import { companyModel } from "../src/assets/company-model.js";
import { companyHeaders } from "../src/services/company-document.service.js";

const snapshot: SheetSnapshot = {
  recordNumber: 546,
  employee: {
    name: "João da Silva",
    registration: "42",
    jobTitle: "Técnico",
    department: "Manutenção",
    admissionDate: "2026-10-01",
    terminationDate: null,
  },
  issuedAt: "2026-10-21T01:00:00.000Z",
  documentDate: "2026-10-25",
  method: "MANUAL",
  template: "PROVISIONAL_FROM_IMAGE_V1",
  items: [
    {
      date: "2026-10-25",
      description: "PAR DE BOTAS DE PROTEÇÃO",
      ca: "27300",
      brand: "BRACOL",
      risk: "02",
      size: "39",
      lot: "L-001",
      variantId: "v",
      lotId: "l",
      quantity: 1,
    },
  ],
};

test("gera PDF legível e Excel com o mesmo item unitário", async () => {
  const pdf = await renderPdf(snapshot);
  const parsed = await PDFDocument.load(pdf);
  assert.equal(parsed.getPageCount(), 1);
  assert.ok(pdf.byteLength > 1000);
  const excel = await renderXlsx(snapshot);
  assert.equal(Buffer.from(excel.subarray(0, 2)).toString(), "PK");
  assert.ok(excel.byteLength > 1000);
});
test("Excel reproduz campos do modelo, datas reais e registro da ficha", async () => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await renderXlsx(snapshot)) as any);
  const sheet = book.getWorksheet("Ficha EPI")!;
  assert.equal(sheet.getCell("E3").value, "Nº de Registro: 546");
  assert.equal(sheet.getCell("A3").value, "Funcionário(a): João da Silva");
  assert.equal(sheet.getCell("A4").value, "Função: Técnico");
  assert.equal(sheet.getCell("A6").numFmt, "dd/mm/yyyy");
  assert.ok(sheet.getCell("A6").value instanceof Date);
  assert.equal(generationDate(snapshot.issuedAt), "2026-10-20");
  assert.equal(
    (sheet.getCell("C11").value as Date).toISOString().slice(0, 10),
    "2026-10-20",
  );
  assert.equal(
    (sheet.getCell("A14").value as Date).toISOString().slice(0, 10),
    "2026-10-25",
  );
  assert.equal(sheet.getCell("B14").value, 1);
  assert.equal(sheet.getCell("D14").value, "27300");
  assert.equal(sheet.getCell("E14").value, "BRACOL");
  assert.equal(sheet.getCell("F14").value, "02");
  assert.deepEqual((sheet.getRow(13).values as any[]).slice(1), sheetHeaders);
  assert.equal(sheet.columnCount, 6);
  assert.equal(sheet.pageSetup.orientation, "landscape");
});
test("PDF pagina textos extensos sem remover dados e Excel expande as linhas", async () => {
  const long: SheetSnapshot = {
    ...snapshot,
    items: Array.from({ length: 15 }, () => ({
      ...snapshot.items[0]!,
      description: "EQUIPAMENTO DE PROTEÇÃO COM DESCRIÇÃO EXTENSA "
        .repeat(4)
        .slice(0, 180),
      brand: "MARCA COM NOME EXTENSO ".repeat(5).slice(0, 100),
      risk: "02 - RISCO MECÂNICO DETALHADO",
    })),
  };
  const pdf = await PDFDocument.load(await renderPdf(long));
  assert.ok(pdf.getPageCount() > 1);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await renderXlsx(long)) as any);
  const ws = book.getWorksheet("Ficha EPI")!;
  assert.equal(ws.getCell("C14").value, long.items[0]!.description);
  assert.equal(ws.getCell("E14").value, long.items[0]!.brand);
  assert.ok(ws.getRow(14).height! > 25);
});
test("modelo da empresa preserva logo e declaração e usa matrícula textual no registro", async () => {
  const input: SheetSnapshot = {
    ...snapshot,
    template: "COMPANY_EPI_2026_V3",
    recordNumber: "IGNORAR-VALOR-ANTIGO",
    employee: { ...snapshot.employee, registration: "000546" },
  };
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await renderXlsx(input)) as any);
  const ws = book.getWorksheet("Ficha EPI")!;
  assert.equal(ws.getImages().length, 1);
  assert.equal(ws.getCell("D2").value, companyModel.safety);
  assert.equal(ws.getCell("G2").value, companyModel.title);
  assert.equal(ws.getCell("A14").text, companyModel.declaration);
  assert.equal(ws.getCell("A15").text, companyModel.instructions);
  assert.equal(ws.getCell("A7").value, "João da Silva");
  assert.equal(ws.getCell("E7").value, "000546");
  assert.equal(ws.getCell("E7").numFmt, "@");
  assert.equal(ws.getCell("A8").value, "Função: Técnico");
  assert.equal(
    (ws.getCell("A11").value as Date).toISOString().slice(0, 10),
    "2026-10-01",
  );
  assert.equal(ws.getCell("D11").value, null);
  assert.equal(
    (ws.getCell("E17").value as Date).toISOString().slice(0, 10),
    "2026-10-20",
  );
  assert.equal(
    (ws.getCell("A20").value as Date).toISOString().slice(0, 10),
    "2026-10-25",
  );
  assert.equal(ws.getCell("B20").value, 1);
  assert.equal(ws.getCell("C20").value, snapshot.items[0]!.description);
  assert.equal(ws.getCell("G20").value, "27300");
  assert.equal(ws.getCell("I20").value, "BRACOL");
  assert.equal(ws.getCell("M20").value, "02");
  assert.deepEqual(
    ["A19", "B19", "C19", "G19", "I19", "M19"].map(
      (cell) => ws.getCell(cell).value,
    ),
    companyHeaders,
  );
  const labels: string[] = [];
  ws.eachRow((row) =>
    row.eachCell((cell) => {
      if (typeof cell.value === "string") labels.push(cell.value);
    }),
  );
  assert.ok(
    !labels.some((value) =>
      /Assinatura \/ Rubrica|Data da Devolução|M\.D\./.test(value),
    ),
  );
  assert.equal(
    (await PDFDocument.load(await renderPdf(input))).getPageCount(),
    1,
  );
});
test("modelo corporativo pagina todos os itens e preserva datas e textos longos", async () => {
  const input: SheetSnapshot = {
    ...snapshot,
    template: "COMPANY_EPI_2026_V3",
    employee: { ...snapshot.employee, terminationDate: "2026-10-31" },
    items: Array.from({ length: 15 }, (_, n) => ({
      ...snapshot.items[0]!,
      description: `${n + 1} EQUIPAMENTO COM DESCRIÇÃO LONGA `
        .repeat(5)
        .slice(0, 180),
      brand: "MARCA COM NOME EXTENSO ".repeat(5).slice(0, 100),
    })),
  };
  assert.ok(
    (await PDFDocument.load(await renderPdf(input))).getPageCount() > 1,
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await renderXlsx(input)) as any);
  const ws = book.worksheets[0]!;
  assert.equal(
    (ws.getCell("D11").value as Date).toISOString().slice(0, 10),
    "2026-10-31",
  );
  assert.equal(ws.getCell("C34").value, input.items[14]!.description);
  assert.equal(ws.getCell("I34").value, input.items[14]!.brand);
  assert.equal(ws.getCell("F34").master.address, "C34");
  assert.equal(ws.getCell("L34").master.address, "I34");
  assert.equal(ws.getCell("O34").master.address, "M34");
  assert.equal(
    ws.getCell("C34").border.bottom?.style,
    ws.getCell("C20").border.bottom?.style,
  );
  assert.ok(ws.getRow(34).height! > 20);
});
