// Importa a base pública CAEPI para public.ca_registry, em lotes e de forma idempotente.
// Uso: npm run ca:import -- <caminho/tgg_export_caepi.txt> [--dry-run]
// Baixe o arquivo da origem oficial (ver Backend/src/services/ca-registry.service.ts).
// Roda fora da função serverless: cada lote é uma chamada curta ao Postgres.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { batches, parseCaepi, type CaRecord } from "../src/services/ca-registry.service.js";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
if (!file) {
  console.error("Informe o arquivo: npm run ca:import -- tgg_export_caepi.txt");
  process.exit(2);
}
// O arquivo oficial é ANSI (Windows-1252); latin1 preserva os acentos usuais.
const encoding = process.argv.includes("--utf8") ? "utf8" : "latin1";
const lines = createInterface({
  input: createReadStream(file, { encoding }),
  crlfDelay: Infinity,
});
async function* readLines() {
  for await (const line of lines) yield line;
}
// The parser is synchronous; buffer one batch at a time to keep memory bounded.
async function* records() {
  const stats = { read: 0, skipped: 0 };
  let buffer: string[] = [];
  let header: string | undefined;
  for await (const line of readLines()) {
    if (header === undefined) {
      header = line;
      continue;
    }
    buffer.push(line);
    if (buffer.length >= 5000) {
      yield* parseCaepi([header, ...buffer], stats);
      buffer = [];
    }
  }
  if (header === undefined) throw new Error("Arquivo CAEPI vazio.");
  yield* parseCaepi([header, ...buffer], stats);
  console.log(`Linhas lidas: ${stats.read}. Ignoradas (C.A. inválido): ${stats.skipped}.`);
}
const db = dryRun
  ? undefined
  : createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { persistSession: false } },
    );
if (!dryRun && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env do backend.");
  process.exit(2);
}
const run = new Date().toISOString();
let written = 0;
async function flush(chunk: CaRecord[]) {
  for (const batch of batches(chunk, 1000)) {
    if (!db) {
      written += batch.length;
      continue;
    }
    const { data, error } = await db.rpc("import_ca_batch", {
      p_run: run,
      p_rows: batch,
    });
    if (error) throw new Error(`Falha ao gravar lote: ${error.message}`);
    written += data ?? 0;
  }
}
let pending: CaRecord[] = [];
for await (const record of records()) {
  pending.push(record);
  if (pending.length >= 5000) {
    await flush(pending);
    pending = [];
  }
}
await flush(pending);
console.log(
  `${dryRun ? "Simulação: " : ""}${written} registros de C.A. ${dryRun ? "seriam gravados" : "gravados"}. Execução ${run}.`,
);
