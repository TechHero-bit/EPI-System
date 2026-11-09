// Base pública CAEPI do Ministério do Trabalho e Emprego.
// Origem (tutorial oficial "Passo a passo para importar base de dados do sistema CAEPI"):
//   ftp://ftp.mtps.gov.br/portal/fiscalizacao/seguranca-e-saude-no-trabalho/caepi/tgg_export_caepi.txt
// Texto delimitado por "|", primeira linha com os nomes das colunas, datas DD/MM/AAAA,
// origem Windows (ANSI). O arquivo é atualizado diariamente às 20h.
// O parser localiza as colunas pelo cabeçalho, não por posição.

export type CaRecord = {
  ca_number: string;
  expires_at: string | null;
  status: string;
  equipment_name: string;
  equipment_description: string;
  manufacturer: string;
  brand: string;
};

const COLUMNS = {
  ca_number: "nrregistroca",
  expires_at: "datavalidade",
  status: "situacao",
  equipment_name: "nomeequipamento",
  equipment_description: "descricaoequipamento",
  manufacturer: "razaosocial",
  brand: "marcaca",
} as const;
const REQUIRED = ["ca_number", "expires_at", "status"] as const;

const clean = (value: string | undefined, max = 500) =>
  (value ?? "").replace(/["\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Normaliza o número do C.A. digitado ou importado (somente dígitos, sem zeros à esquerda). */
export function normalizeCaNumber(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).trim().replace(/^C\.?A\.?\s*/i, "");
  if (!/^\d{1,10}$/.test(digits)) return null;
  return String(Number(digits));
}

function isoDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value.trim());
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(Date.UTC(+y!, +m! - 1, +d!));
  return date.getUTCDate() === +d! && date.getUTCMonth() === +m! - 1
    ? `${y}-${m}-${d}`
    : null;
}

/** Converte as linhas do arquivo em registros. Linhas inválidas são contadas e ignoradas. */
export function* parseCaepi(
  lines: Iterable<string>,
  stats = { read: 0, skipped: 0 },
): Generator<CaRecord> {
  let index: Record<keyof typeof COLUMNS, number> | undefined;
  for (const raw of lines) {
    const line = raw.replace(/^﻿/, "");
    if (!line.trim()) continue;
    const cells = line.split("|");
    if (!index) {
      const header = cells.map((c) => c.trim().toLowerCase());
      index = Object.fromEntries(
        Object.entries(COLUMNS).map(([key, name]) => [key, header.indexOf(name)]),
      ) as Record<keyof typeof COLUMNS, number>;
      const missing = REQUIRED.filter((key) => index![key] < 0);
      if (missing.length)
        throw new Error(
          `Cabeçalho CAEPI não reconhecido. Colunas ausentes: ${missing.map((k) => COLUMNS[k]).join(", ")}.`,
        );
      continue;
    }
    stats.read++;
    const cell = (key: keyof typeof COLUMNS, max?: number) =>
      index![key] >= 0 ? clean(cells[index![key]], max) : "";
    const ca = normalizeCaNumber(cell("ca_number"));
    if (!ca) {
      stats.skipped++;
      continue;
    }
    yield {
      ca_number: ca,
      expires_at: isoDate(cell("expires_at")),
      status: cell("status", 60),
      equipment_name: cell("equipment_name", 300),
      equipment_description: cell("equipment_description", 2000),
      manufacturer: cell("manufacturer", 300),
      brand: cell("brand", 300),
    };
  }
  if (!index) throw new Error("Arquivo CAEPI vazio.");
}

/**
 * Agrupa em lotes e mantém só a ocorrência de maior validade por C.A. dentro do lote.
 * O mesmo C.A. pode aparecer em várias linhas (laudos/referências diferentes).
 */
export function* batches(records: Iterable<CaRecord>, size = 1000) {
  let batch = new Map<string, CaRecord>();
  for (const record of records) {
    const previous = batch.get(record.ca_number);
    if (!previous || (record.expires_at ?? "") > (previous.expires_at ?? ""))
      batch.set(record.ca_number, record);
    if (batch.size >= size) {
      yield [...batch.values()];
      batch = new Map();
    }
  }
  if (batch.size) yield [...batch.values()];
}
