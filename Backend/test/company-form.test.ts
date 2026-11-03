import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  PDFDocument,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import {
  renderPdf,
  renderXlsx,
  renderSignedPdf,
  type SheetSnapshot,
} from "../src/services/document.service.js";

const snapshot: SheetSnapshot = {
  template: "COMPANY_EPI_2026_V4",
  employee: {
    name: "João de Souza",
    registration: "000546",
    jobTitle: "Técnico de telecomunicações",
    department: "Operações",
    admissionDate: "2025-07-01",
    terminationDate: "2026-10-31",
  },
  recordNumber: "NAO-USAR",
  issuedAt: "2026-10-23T01:00:00Z",
  documentDate: "2026-10-24",
  method: "MANUAL",
  items: [
    {
      date: "2026-10-29",
      description: "PAR DE BOTAS DE PROTEÇÃO",
      ca: "0027300",
      brand: "BRACOL",
      risk: "02",
      size: "40",
      variantId: "v-1",
      quantity: 1,
    },
  ],
};

test("ficha original mantém dez colunas, legendas, matrícula e datas nos campos correspondentes", async () => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await renderXlsx(snapshot)) as any);
  const ws = book.worksheets[0]!;
  assert.equal(ws.getImages().length, 1);
  assert.equal(ws.getCell("B6").value, snapshot.employee.name);
  assert.equal(ws.getCell("F6").value, "000546");
  assert.equal(ws.getCell("F6").numFmt, "@");
  assert.equal(ws.getCell("B8").value, snapshot.employee.jobTitle);
  for (const [cell, date] of [
    ["B10", "2025-07-01"],
    ["F10", "2026-10-31"],
    ["A21", "2026-10-29"],
  ]) {
    assert.equal(
      (ws.getCell(cell!).value as Date).toISOString().slice(0, 10),
      date,
    );
    assert.equal(ws.getCell(cell!).numFmt, "dd/mm/yyyy");
  }
  assert.equal(
    ws.getCell("A17").value,
    "Rio de Janeiro, 22 de outubro de 2026.",
  );
  assert.equal(ws.getCell("G17").value, null);
  assert.equal(ws.getCell("B21").value, 1);
  assert.equal(ws.getCell("C21").value, snapshot.items[0]!.description);
  assert.equal(ws.getCell("E21").value, "0027300");
  assert.equal(ws.getCell("F21").value, "BRACOL");
  assert.equal(ws.getCell("I21").value, "02");
  for (const cell of ["H21", "M21", "N21"])
    assert.equal(ws.getCell(cell).value, null);
  assert.match(ws.getCell("G5").text, /Motivos de Devolução/);
  assert.equal(ws.getCell("O5").value, "LEGENDA");
  assert.deepEqual(
    ["A19", "B19", "C19", "E19", "F19", "H19", "I19", "K19", "M19", "N19"].map(
      (c) => ws.getCell(c).text.trim(),
    ),
    [
      "Data da Entrega",
      "Qtd.",
      "Descrição do E.P.I.",
      "C.A.",
      "Marca",
      "Assinatura / Rubrica",
      "Risco",
      "Data da Devolução",
      "M.D.",
      "Assinatura / Rubrica",
    ],
  );
  assert.equal(ws.pageSetup.printArea, "A2:O40");
  assert.equal(ws.pageSetup.orientation, "landscape");
  assert.equal(
    (await PDFDocument.load(await renderPdf(snapshot))).getPageCount(),
    1,
  );
});

test("cópia assinada marca cada EPI em todas as páginas sem marcar linhas vazias ou devoluções", async () => {
  const input: SheetSnapshot = {
    ...snapshot,
    method: "ELECTRONIC",
    demonstration: true,
    items: Array.from({ length: 15 }, (_, i) => ({
      ...snapshot.items[0]!,
      description: `${i + 1} EQUIPAMENTO COM DESCRIÇÃO LONGA `
        .repeat(6)
        .slice(0, 180),
    })),
  };
  const original = await renderPdf(input);
  const preserved = new Uint8Array(original);
  const signature = {
    signerName: input.employee.name,
    signedAt: "2026-10-28T15:00:00Z",
    documentSha256: "b".repeat(64),
  };
  const signed = await PDFDocument.load(
    await renderSignedPdf(original, input, signature),
  );
  assert.deepEqual(original, preserved);
  assert.equal(
    signed.getPageCount(),
    (await PDFDocument.load(original)).getPageCount(),
  );
  assert.ok(signed.getPageCount() > 1);
  const marker = Buffer.from("Assinado digitalmente", "latin1")
    .toString("hex")
    .toUpperCase();
  let marks = 0;
  for (const page of signed.getPages()) {
    const contents = page.node.Contents() as PDFArray;
    for (const ref of contents.asArray()) {
      const stream = signed.context.lookup(ref, PDFRawStream);
      const operators = Buffer.from(
        decodePDFRawStream(stream).decode(),
      ).toString("latin1");
      marks += operators.split(`<${marker}>`).length - 1;
      for (const footer of [
        "Original SHA-256",
        "DEMONSTRAÇÃO",
        "Cópia para impressão",
      ])
        assert.ok(
          !operators.includes(
            Buffer.from(footer, "latin1").toString("hex").toUpperCase(),
          ),
        );
    }
  }
  assert.equal(marks, input.items.length + 2 * signed.getPageCount());
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await renderXlsx(input, signature)) as any);
  let rows = 0;
  for (const ws of book.worksheets) {
    assert.equal(ws.headerFooter?.oddFooter, "&LAssinado digitalmente");
    for (let row = 21; row <= 40; row++) {
      const description = ws.getCell(`C${row}`);
      if (
        description.master.address === description.address &&
        description.value
      ) {
        assert.equal(ws.getCell(`H${row}`).value, "Assinado digitalmente");
        rows++;
      } else if (!description.value)
        assert.equal(ws.getCell(`H${row}`).value, null);
      assert.equal(ws.getCell(`N${row}`).value, null);
    }
  }
  assert.equal(rows, input.items.length);
});

test("Excel e PDF preservam o estilo escolhido e o PDF incorpora a fonte", async () => {
  const input: SheetSnapshot = {
    ...snapshot,
    method: "ELECTRONIC",
    items: [snapshot.items[0]!, snapshot.items[0]!],
  };
  for (const [signatureStyle, font] of [
    ["classic", "Dancing Script"],
    ["handwritten", "Caveat"],
    ["elegant", "Allura"],
  ]) {
    const signerName = "João de Souza Albuquerque e Silva";
    const signature = {
      signerName,
      signatureStyle,
      signedAt: "2026-10-28T15:00:00Z",
      documentSha256: "b".repeat(64),
    };
    const pdf = await PDFDocument.load(
      await renderSignedPdf(await renderPdf(input), input, signature),
    );
    const objects = pdf.context
      .enumerateIndirectObjects()
      .map(([, object]) => object.toString())
      .join("\n");
    assert.match(objects, /\/FontFile2/);
    assert.match(objects, new RegExp(`/BaseFont /${font!.replace(/ /g, "")}`));
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      (await renderXlsx(input, {
        signerName,
        signatureStyle,
        signedAt: "2026-10-28T15:00:00Z",
        documentSha256: "b".repeat(64),
      })) as any,
    );
    const ws = book.worksheets[0]!;
    assert.equal(ws.getCell("G17").value, signerName);
    assert.equal(ws.getCell("G17").font.name, font);
    for (const row of [21, 22]) {
      const cell = ws.getCell(`H${row}`);
      assert.equal(cell.value, signerName);
      assert.equal(cell.font.name, font);
      assert.equal(cell.alignment.shrinkToFit, true);
      assert.ok(!cell.alignment.wrapText);
      assert.equal(ws.getCell(`N${row}`).value, null);
    }
    assert.equal(ws.getCell("H23").value, null);
    assert.equal(ws.headerFooter?.oddFooter, "&LAssinado digitalmente");
  }
});

test("textos extensos preservam os quinze itens e usam as mesmas páginas no PDF e Excel", async () => {
  const input: SheetSnapshot = {
    ...snapshot,
    employee: {
      ...snapshot.employee,
      name: "W".repeat(160),
      registration: "0".repeat(50),
      jobTitle: "W".repeat(120),
    },
    items: Array.from({ length: 15 }, (_, i) => ({
      ...snapshot.items[0]!,
      description: `${i + 1} EQUIPAMENTO COM DESCRIÇÃO EXTENSA `
        .repeat(6)
        .slice(0, 180),
      ca: "W".repeat(50),
      brand: "MARCA COM NOME EXTENSO ".repeat(5).slice(0, 100),
      risk: "W".repeat(30),
    })),
  };
  const pdf = await PDFDocument.load(await renderPdf(input));
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await renderXlsx(input)) as any);
  assert.ok(pdf.getPageCount() > 1);
  assert.equal(book.worksheets.length, pdf.getPageCount());
  const descriptions: string[] = [];
  for (const ws of book.worksheets) {
    assert.equal(ws.getImages().length, 1);
    assert.equal(ws.getCell("B6").value, input.employee.name);
    assert.equal(ws.getCell("F6").value, input.employee.registration);
    for (let row = 21; row <= 40; row++) {
      const cell = ws.getCell(`C${row}`);
      if (cell.master.address === cell.address && cell.value) {
        descriptions.push(cell.value as string);
        assert.equal(ws.getCell(`B${row}`).value, 1);
        assert.equal(ws.getCell(`E${row}`).value, "W".repeat(50));
        assert.equal(ws.getCell(`F${row}`).value, input.items[0]!.brand);
      }
    }
  }
  assert.deepEqual(
    descriptions,
    input.items.map((i) => i.description),
  );
});
