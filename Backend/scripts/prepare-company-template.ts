/** Build-time preparation only. The application never requires Microsoft Excel. */
import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const source = process.argv[2];
if (!source) throw new Error("Informe o caminho do modelo XLSX da empresa.");
const original = await readFile(source);
const book = new ExcelJS.Workbook();
await book.xlsx.load(original as any);
book.creator = "Centauro";
book.lastModifiedBy = "EPI System";
book.created = book.modified = new Date("2026-01-01T00:00:00Z");
const ws = book.worksheets[0]!;
ws.name = "Ficha EPI";

// Keep the supplied logo, column widths, declaration, legends and header styles.
// Split only the employee inputs so dates remain typed and labels cannot overlap.
for (const area of ["A6:F7", "A8:F9", "A10:F12"]) ws.unMergeCells(area);
const inputs = [
  ["A6:A7", "Funcionário (a):"],
  ["B6:D7", ""],
  ["E6:E7", "Nº do Registro:"],
  ["F6:F7", ""],
  ["A8:A9", "Função:"],
  ["B8:F9", ""],
  ["A10:A12", "Data da Admissão:"],
  ["B10:D12", ""],
  ["E10:E12", "Data da Demissão:"],
  ["F10:F12", ""],
] as const;
for (const [address, value] of inputs) {
  ws.mergeCells(address);
  const cell = ws.getCell(address.split(":")[0]!);
  cell.value = value || null;
  cell.font = { name: "Times New Roman", size: 12, bold: !!value };
  cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  cell.border = {};
}
// Reinstate the outside frame of the employee block after splitting its inputs.
for (let row = 6; row <= 12; row++) {
  ws.getCell(row, 1).border = {
    ...ws.getCell(row, 1).border,
    left: { style: "medium" },
  };
  ws.getCell(row, 6).border = {
    ...ws.getCell(row, 6).border,
    right: { style: "medium" },
  };
}
for (let col = 1; col <= 6; col++)
  ws.getCell(12, col).border = {
    ...ws.getCell(12, col).border,
    bottom: { style: "medium" },
  };

ws.getCell("A14").alignment = {
  horizontal: "justify",
  vertical: "middle",
  wrapText: true,
};
ws.getCell("A15").alignment = {
  horizontal: "left",
  vertical: "middle",
  wrapText: true,
};
ws.getCell("A17").value = null; // Generation city/date is filled at issuance.
ws.getCell("G17").value = null; // Never copy an example signature.

// The screenshot has a continuous grid. The source's off-print second header and
// merged spacer rows are replaced by twenty identical blank delivery rows.
const columns = [
  [1, 1],
  [2, 2],
  [3, 4],
  [5, 5],
  [6, 7],
  [8, 8],
  [9, 10],
  [11, 12],
  [13, 13],
  [14, 15],
] as const;
ws.unMergeCells("A21:O64");
for (let row = 21; row <= 64; row++) {
  for (let col = 1; col <= 15; col++) {
    const cell = ws.getCell(row, col);
    cell.value = null;
    cell.style = {};
  }
  ws.getRow(row).height = row <= 40 ? 21 : 15;
  if (row > 40) continue;
  for (const [left, right] of columns) {
    if (left !== right) ws.mergeCells(row, left, row, right);
    const cell = ws.getCell(row, left);
    cell.font = { name: "Times New Roman", size: 12 };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: left === 1 ? "medium" : "thin" },
      right: { style: right === 15 ? "medium" : "thin" },
    };
  }
  ws.getCell(`K${row}`).value = "/       /";
}
ws.views = [{ showGridLines: false }];
ws.pageSetup = {
  paperSize: 9,
  orientation: "landscape",
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 1,
  printArea: "A2:O40",
  horizontalCentered: false,
  verticalCentered: false,
  margins: {
    left: 0.12,
    right: 0.12,
    top: 0.12,
    bottom: 0.18,
    header: 0,
    footer: 0,
  },
};
ws.headerFooter = {};
await mkdir("dist/company-template", { recursive: true });
await book.xlsx.writeFile("dist/company-template/base.xlsx");
await writeFile(
  "dist/company-template/source.json",
  JSON.stringify(
    {
      sha256: createHash("sha256").update(original).digest("hex"),
      sourceName: "MODELO FICHA DE EPI 2026.xlsx",
    },
    null,
    2,
  ),
);
console.log("Modelo-base preparado em dist/company-template/base.xlsx");
