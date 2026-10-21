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
