import { mkdir, writeFile } from "node:fs/promises";
import {
  renderPdf,
  renderXlsx,
  type SheetSnapshot,
} from "../src/services/document.service.js";
const snapshot: SheetSnapshot = {
  employee: {
    name: "João Exemplo — DADOS FICTÍCIOS",
    registration: "INTERNA-42",
    jobTitle: "Técnico de telecomunicações",
    department: "Operações",
    admissionDate: "2025-07-01",
    terminationDate: null,
  },
  recordNumber: "INTERNA-42",
  issuedAt: "2026-10-21T13:00:00.000Z",
  documentDate: "2026-10-25",
  method: "MANUAL",
  template: "COMPANY_EPI_2026_V4",
  organizationName: "Empresa demonstrativa",
  demonstration: true,
  items: [
    ["PAR DE BOTAS DE PROTEÇÃO", "27300", "BRACOL", "02"],
    ["CAPACETE DE PROTEÇÃO", "498", "MSA", "02"],
    ["PROTETOR AURICULAR", "5745", "3M", "01"],
    ["PAR DE LUVAS PIGMENTADAS", "32038", "SUPER SAFETY", "02"],
    ["ÓCULOS DE PROTEÇÃO GRAFITE", "35138", "CARBOGRAFITE", "02"],
    ["ÓCULOS DE PROTEÇÃO INCOLOR", "35138", "CARBOGRAFITE", "02"],
  ].map(([description, ca, brand, risk], i) => ({
    date: i === 0 ? "2026-10-24" : "2026-10-25",
    description: description!,
    ca: ca!,
    brand: brand!,
    risk: risk!,
    quantity: 1,
    size: "Único",
    variantId: `v-${i}`,
  })),
};
await mkdir("dist/document-preview", { recursive: true });
await writeFile("dist/document-preview/ficha.pdf", await renderPdf(snapshot));
await writeFile("dist/document-preview/ficha.xlsx", await renderXlsx(snapshot));
const stress: SheetSnapshot = {
  ...snapshot,
  employee: {
    ...snapshot.employee,
    name: "W".repeat(160),
    registration: "0".repeat(50),
    jobTitle: "W".repeat(120),
  },
  items: Array.from({ length: 15 }, (_, i) => ({
    ...snapshot.items[0]!,
    description: `${i + 1} EQUIPAMENTO COM DESCRIÇÃO LONGA `
      .repeat(6)
      .slice(0, 180),
    brand: "MARCA COM NOME EXTENSO ".repeat(5).slice(0, 100),
    ca: "W".repeat(50),
    risk: "W".repeat(30),
  })),
};
await writeFile(
  "dist/document-preview/ficha-stress.pdf",
  await renderPdf(stress),
);
await writeFile(
  "dist/document-preview/ficha-stress.xlsx",
  await renderXlsx(stress),
);
console.log("Amostras fictícias: dist/document-preview/ficha.pdf e ficha.xlsx");
