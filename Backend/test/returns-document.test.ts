import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import {
  renderPdf,
  renderPrintablePdf,
  renderXlsx,
  type SheetSnapshot,
} from "../src/services/document.service.js";
import request from "supertest";
import app from "../src/app.js";

const base: SheetSnapshot = {
  template: "COMPANY_EPI_2026_V4",
  employee: {
    name: "Pessoa Fictícia",
    registration: "000777",
    jobTitle: "Operador(a)",
    department: "Operações",
    admissionDate: "2025-01-10",
    terminationDate: "2026-11-05",
  },
  recordNumber: "000777",
  issuedAt: "2026-10-01T12:00:00Z",
  documentDate: "2026-10-01",
  method: "MANUAL",
  items: [
    { date: "2026-10-01", description: "BOTA FICTÍCIA", ca: "123", brand: "MARCA", risk: "", size: "40", variantId: "v1", quantity: 1 },
    { date: "2026-10-01", description: "LUVA FICTÍCIA", ca: "456", brand: "MARCA", risk: "", size: "M", variantId: "v2", quantity: 1 },
  ],
};
const withReturn: SheetSnapshot = { ...base, returns: [{ index: 1, date: "2026-11-05", reasonCode: 13 }] };
const hex = (text: string) => Buffer.from(text, "latin1").toString("hex").toUpperCase();
async function pdfText(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  let out = "";
  for (const page of pdf.getPages())
    for (const ref of (page.node.Contents() as PDFArray).asArray())
      out += Buffer.from(decodePDFRawStream(pdf.context.lookup(ref, PDFRawStream)).decode()).toString("latin1");
  return out;
}

test("3.2 PDF e XLSX mostram devolução (data, M.D., assinatura) sem alterar o original", async () => {
  const original = await renderPdf(base);
  const copy = new Uint8Array(original);
  // Sem devolução nem assinatura eletrônica, a cópia é o próprio original.
  assert.equal(await renderPrintablePdf(original, base), original);
  const printable = await renderPrintablePdf(original, withReturn);
  assert.deepEqual(original, copy);
  const text = await pdfText(printable);
  for (const value of ["05/11/2026", "Assinatura presencial"]) assert.ok(text.includes(`<${hex(value)}>`), value);
  assert.ok(text.includes(`<${hex("13")}>`));
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await renderXlsx(withReturn)) as any);
  const ws = book.worksheets[0]!;
  const rows = [21, 22];
  assert.equal(ws.getCell(`C${rows[1]}`).value, "LUVA FICTÍCIA");
  assert.equal((ws.getCell(`K${rows[1]}`).value as Date).toISOString().slice(0, 10), "2026-11-05");
  assert.equal(ws.getCell(`M${rows[1]}`).value, 13);
  assert.equal(ws.getCell(`N${rows[1]}`).value, "Assinatura presencial");
  // Item não devolvido mantém os campos em branco do modelo.
  assert.equal(ws.getCell(`K${rows[0]}`).value, "/       /");
  assert.equal(ws.getCell(`M${rows[0]}`).value, null);
  assert.equal(ws.getCell(`N${rows[0]}`).value, null);
  // Ficha presencial não recebe a indicação de assinatura digital.
  assert.ok(!text.includes(`<${hex("Assinado digitalmente")}>`));
  assert.deepEqual(ws.headerFooter?.oddFooter ?? "", "");
});

test("3.2 devolução com assinatura eletrônica mantém a paginação nos dois formatos", async () => {
  const signed = { ...withReturn, method: "ELECTRONIC" as const };
  const signature = { signerName: "Pessoa Fictícia", signatureStyle: "classic", signedAt: "2026-10-02T12:00:00Z", documentSha256: "a".repeat(64) };
  const pdf = await PDFDocument.load(await renderPrintablePdf(await renderPdf(signed), signed, signature));
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await renderXlsx(signed, signature)) as any);
  assert.equal(pdf.getPageCount(), book.worksheets.length);
  assert.equal(book.worksheets[0]!.getCell("N22").value, "Assinatura presencial");
});

test("rota de devolução exige sessão", async () => {
  const res = await request(app).post("/api/sheets/11111111-1111-4111-8111-111111111111/returns").send({});
  assert.equal(res.status, 401);
});
