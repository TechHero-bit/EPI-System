import ExcelJS from "exceljs";
import { SIGNATURE_STYLES } from "../../../contracts/signature.mjs";
import fontkit from "@pdf-lib/fontkit";
import { signatureFonts } from "../assets/signature-fonts.js";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { companyForm2026 as template } from "../assets/company-form-2026.js";
import type {
  SheetSnapshot,
  SignaturePrintEvidence,
} from "./document.service.js";

// V4 fills the company's printed form. V3 remains available for historical sheets.
export const COMPANY_FORM_TEMPLATE = "COMPANY_EPI_2026_V4" as const;
const slotsPerPage = 20;
const firstRow = 21;
// Excel's print driver measures column widths and row heights independently.
const scaleX = template.bounds.width / template.geometry.width;
const scale = template.bounds.height / template.geometry.height;
const decode = (base64: string) =>
  Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
const dateBR = (value: string) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "";
const dateValue = (value: string) =>
  value ? new Date(`${value.slice(0, 10)}T12:00:00Z`) : null;
const normalized = (value: string) =>
  value
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u2010-\u2015]/g, "-");
const columns = [
  ["A21:A21", 1, 1],
  ["B21:B21", 2, 2],
  ["C21:D21", 3, 4],
  ["E21:E21", 5, 5],
  ["F21:G21", 6, 7],
  ["H21:H21", 8, 8],
  ["I21:J21", 9, 10],
  ["K21:L21", 11, 12],
  ["M21:M21", 13, 13],
  ["N21:O21", 14, 15],
] as const;
// Grid coordinates from the embedded PDF; Excel scaling causes border drift.
const gridX = [
  9.984, 81.204, 114.2, 294.23, 363.85, 450.97, 539.2, 584.56, 657.4, 690.42,
  820.32,
];
const gridY = [
  305.03, 292.07, 279.11, 266.15, 253.19, 240.23, 227.24, 214.28, 201.32,
  188.36, 175.4, 162.44, 149.48, 136.52, 123.56, 110.6, 97.62, 84.66, 71.7,
  58.74, 45.78,
];
function itemBox(column: number, slot = 0, slots = 1): Box {
  return {
    x: gridX[column]!,
    top: template.bounds.pageHeight - gridY[slot]!,
    width: gridX[column + 1]! - gridX[column]!,
    height: gridY[slot]! - gridY[slot + slots]!,
  };
}

type Address = keyof typeof template.geometry.cells;
type Box = { x: number; top: number; width: number; height: number };
const box = (address: Address): Box => {
  const column = columns.findIndex(([key]) => key === address);
  if (column >= 0) return itemBox(column);
  const c = template.geometry.cells[address];
  return {
    x: template.bounds.left + c.x * scaleX,
    top: template.bounds.top + c.y * scale,
    width: c.width * scaleX,
    height: c.height * scale,
  };
};
const rowHeight = box("A21:A21").height;
const padding = 2;
const bodySize = 12 * template.fontScale;
// Excel uses a taller line box than PDF font ascenders. Reserve that same space.
const lineSpacing = 1.3;
const verticalPadding = 1.25;
const lineHeight = bodySize * lineSpacing;

// Measure actual glyphs, including unbroken C.A./registration strings. Never truncate.
function wrap(
  value: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of normalized(value).split(/ +/)) {
    if (!word) continue;
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      current = next;
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
  if (current) lines.push(current);
  return lines;
}
function fitted(value: string, font: PDFFont, area: Box, preferred = bodySize) {
  for (let size = preferred; size >= 3.5; size -= 0.15) {
    const lines = wrap(value, font, size, area.width - 2 * padding);
    if (lines.length * size * lineSpacing <= area.height - 2 * verticalPadding)
      return { lines, size };
  }
  throw new Error("O texto excede o espaço disponível no modelo da ficha.");
}
function drawText(
  page: PDFPage,
  font: PDFFont,
  area: Box,
  lines: string[],
  size: number,
  centered = true,
) {
  const leading = size * lineSpacing;
  const baseline =
    template.bounds.pageHeight -
    area.top -
    (area.height - lines.length * leading) / 2 -
    size;
  lines.forEach((text, i) =>
    page.drawText(text, {
      x:
        area.x +
        (centered
          ? (area.width - font.widthOfTextAtSize(text, size)) / 2
          : padding),
      y: baseline - i * leading,
      size,
      font,
      color: rgb(0, 0, 0),
    }),
  );
}
function headerFields(s: SheetSnapshot) {
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(s.issuedAt));
  return [
    ["B6:D7", "B6", s.employee.name],
    ["F6:F7", "F6", s.employee.registration],
    ["B8:F9", "B8", s.employee.jobTitle],
    ["B10:D12", "B10", dateBR(s.employee.admissionDate)],
    ["F10:F12", "F10", dateBR(s.employee.terminationDate ?? "")],
    ["A17:F17", "A17", `Rio de Janeiro, ${date}.`],
  ] as const;
}
function itemValues(item: SheetSnapshot["items"][number]) {
  return [
    dateBR(item.date),
    "1",
    item.description,
    item.ca,
    item.brand,
    "",
    item.risk,
    "/       /",
    "",
    "",
  ];
}
type PlannedItem = {
  item: SheetSnapshot["items"][number];
  slot: number;
  slots: number;
  lines: string[][];
};
function plan(s: SheetSnapshot, font: PDFFont): PlannedItem[][] {
  const pages: PlannedItem[][] = [[]];
  let used = 0;
  for (const item of s.items) {
    if (item.quantity !== 1)
      throw new Error("Cada EPI deve ter quantidade igual a 1.");
    const lines = itemValues(item).map((value, i) =>
      i === 7
        ? [value]
        : wrap(value, font, bodySize, box(columns[i]![0]).width - 2 * padding),
    );
    const slots = Math.max(
      1,
      Math.ceil(
        (Math.max(...lines.map((l) => l.length)) * lineHeight +
          2 * verticalPadding) /
          rowHeight,
      ),
    );
    if (slots > slotsPerPage)
      throw new Error("Descrição de EPI excede uma página do modelo.");
    if (used + slots > slotsPerPage) {
      pages.push([]);
      used = 0;
    }
    pages.at(-1)!.push({ item, slot: used, slots, lines });
    used += slots;
  }
  return pages;
}

export async function renderExactCompanyPdf(
  s: SheetSnapshot,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("COMPROVANTE DE FORNECIMENTO (E.P.I.)");
  pdf.setAuthor("Centauro");
  pdf.setCreationDate(new Date(s.issuedAt));
  pdf.setModificationDate(new Date(s.issuedAt));
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const [background] = await pdf.embedPdf(decode(template.pdfBase64));
  const pages = plan(s, font);
  for (const items of pages) {
    const page = pdf.addPage([
      template.bounds.pageWidth,
      template.bounds.pageHeight,
    ]);
    page.drawPage(background!);
    for (const [address, , value] of headerFields(s)) {
      const area = box(address);
      const text = fitted(value, font, area);
      drawText(page, font, area, text.lines, text.size, address === "A17:F17");
    }
    for (const entry of items) {
      for (const [i] of columns.entries()) {
        const area = itemBox(i, entry.slot, entry.slots);
        // Clear the interior, preserving the original border strokes. For long
        // entries this also removes internal horizontal lines between slots.
        const left = i === 0 ? 0.61 : 0.31;
        const right = i === columns.length - 1 ? 0.61 : 0.31;
        page.drawRectangle({
          x: area.x + left,
          y: template.bounds.pageHeight - area.top - area.height + 0.31,
          width: area.width - left - right,
          height: area.height - 0.62,
          color: rgb(1, 1, 1),
        });
        drawText(page, font, area, entry.lines[i]!, bodySize);
      }
    }
  }
  return pdf.save();
}

export async function renderExactCompanyXlsx(
  s: SheetSnapshot,
  signature?: SignaturePrintEvidence,
): Promise<Uint8Array> {
  const signatureStyle = SIGNATURE_STYLES.find(
    (style) => style.id === signature?.signatureStyle,
  );
  const styledSignature = signatureStyle && signature?.signerName.trim();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(decode(template.workbookBase64) as any);
  book.created = book.modified = new Date(s.issuedAt);
  const measurement = await PDFDocument.create();
  const font = await measurement.embedFont(StandardFonts.TimesRoman);
  const pages = plan(s, font);
  const first = book.worksheets[0]!;
  const model = structuredClone(first.model);
  for (const [index, items] of pages.entries()) {
    const ws =
      index === 0 ? first : book.addWorksheet(`Ficha EPI ${index + 1}`);
    if (index)
      ws.model = { ...structuredClone(model), id: ws.id, name: ws.name };
    for (const [address, cellAddress, value] of headerFields(s)) {
      const cell = ws.getCell(cellAddress);
      const text = fitted(value, font, box(address));
      cell.value = value || null;
      cell.numFmt = "@";
      cell.font = {
        name: "Times New Roman",
        size: text.size / template.fontScale,
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: address === "A17:F17" ? "center" : "left",
        wrapText: true,
      };
    }
    ws.getCell("B10").value = dateValue(s.employee.admissionDate);
    ws.getCell("B10").numFmt = "dd/mm/yyyy";
    ws.getCell("F10").value = dateValue(s.employee.terminationDate ?? "");
    ws.getCell("F10").numFmt = "dd/mm/yyyy";
    for (const entry of items) {
      const start = firstRow + entry.slot;
      const end = start + entry.slots - 1;
      ws.unMergeCells(`A${start}:O${end}`);
      const values: ExcelJS.CellValue[] = [
        dateValue(entry.item.date),
        1,
        entry.item.description,
        entry.item.ca,
        entry.item.brand,
        signature ? styledSignature || "Assinado digitalmente" : null,
        entry.item.risk,
        "/       /",
        null,
        null,
      ];
      for (const [i, [, left, right]] of columns.entries()) {
        for (let row = start; row <= end; row++)
          for (let col = left; col <= right; col++)
            ws.getCell(row, col).value = null;
        if (left !== right || start !== end)
          ws.mergeCells(start, left, end, right);
        const cell = ws.getCell(start, left);
        // Template cells can share style objects; a signature's font must not
        // be overwritten when the following equipment cells are formatted.
        cell.style = structuredClone(cell.style);
        cell.value = values[i]!;
        cell.numFmt = i === 0 ? "dd/mm/yyyy" : i === 1 ? "0" : "@";
        cell.font = { name: "Times New Roman", size: 12 };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        if (i === 5 && styledSignature) {
          cell.font = { name: signatureStyle.excelFont, size: 12 };
          cell.alignment = {
            horizontal: "center",
            vertical: "middle",
            wrapText: false,
            shrinkToFit: true,
          };
        }
        cell.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: left === 1 ? "medium" : "thin" },
          right: { style: right === 15 ? "medium" : "thin" },
        };
      }
    }
    if (signature) {
      const cell = ws.getCell("G17");
      cell.style = structuredClone(cell.style);
      cell.value = styledSignature || "Assinado digitalmente";
      cell.font = {
        name: signatureStyle?.excelFont ?? "Times New Roman",
        size: 16,
      };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        shrinkToFit: true,
      };
    }
    ws.headerFooter = signature ? { oddFooter: "&LAssinado digitalmente" } : {};
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
}

export async function stampExactCompanyPdf(
  original: Uint8Array,
  s: SheetSnapshot,
  signature: SignaturePrintEvidence,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original);
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const style = SIGNATURE_STYLES.find((s) => s.id === signature.signatureStyle);
  let signatureFont = font;
  if (style) {
    pdf.registerFontkit(fontkit);
    signatureFont = await pdf.embedFont(decode(signatureFonts[style.id]), {
      subset: true,
    });
  }
  const signatureText =
    style && signature.signerName.trim()
      ? signature.signerName.trim()
      : "Assinado digitalmente";
  const pages = plan(s, font);
  if (pdf.getPageCount() !== pages.length)
    throw new Error("A paginação do original não corresponde à ficha.");
  pdf.setSubject(
    `Cópia para impressão. Original SHA-256: ${signature.documentSha256}`,
  );
  for (const [index, items] of pages.entries()) {
    const page = pdf.getPage(index);
    const collaboratorArea: Box = {
      x: 450.97,
      top: template.bounds.pageHeight - 355.51,
      width: 369.35,
      height: 16.82,
    };
    const collaboratorText = fitted(
      signatureText,
      signatureFont,
      collaboratorArea,
      12,
    );
    drawText(
      page,
      signatureFont,
      collaboratorArea,
      collaboratorText.lines,
      collaboratorText.size,
    );
    page.drawText("Assinado digitalmente", {
      x: template.bounds.left,
      y: 24,
      size: 8,
      font,
      color: rgb(0, 0, 0),
    });
    for (const entry of items) {
      const area = itemBox(5, entry.slot, entry.slots);
      const text = fitted(
        signatureText,
        signatureFont,
        area,
        style ? 10 : bodySize,
      );
      drawText(page, signatureFont, area, text.lines, text.size);
    }
  }
  return pdf.save();
}
