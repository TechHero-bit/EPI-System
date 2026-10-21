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
  recordNumber: 546,
  issuedAt: "2026-10-21T13:00:00.000Z",
  documentDate: "2026-10-25",
  method: "MANUAL",
  template: "EPI_RECEIPT_V2",
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
    lot: "FICTÍCIO",
    variantId: `v-${i}`,
    lotId: `l-${i}`,
  })),
};
await mkdir("dist/document-preview", { recursive: true });
await writeFile("dist/document-preview/ficha.pdf", await renderPdf(snapshot));
await writeFile("dist/document-preview/ficha.xlsx", await renderXlsx(snapshot));
console.log("Amostras fictícias: dist/document-preview/ficha.pdf e ficha.xlsx");
