import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, "supabase/migrations");
const files = (await readdir(directory))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const parts = await Promise.all(
  files.map(
    async (file) =>
      `-- MIGRATION: ${file}\n${await readFile(resolve(directory, file), "utf8")}`,
  ),
);
const sql = `-- GERADO: npm run db:setup. Apenas projeto Supabase NOVO.\n-- Não combinar com a execução das migrations no mesmo banco.\nbegin;\ndo $$begin if to_regclass('public.organizations') is not null then raise exception 'Estrutura EPI já existe. Use somente as migrations pendentes.';end if;end $$;\n\n${parts.join("\n\n")}\ncommit;\n`;
if (process.argv.includes("--check")) {
  if ((await readFile(resolve(root, "setup.sql"), "utf8")) !== sql)
    throw new Error("setup.sql desatualizado. Rode npm run db:setup.");
} else await writeFile(resolve(root, "setup.sql"), sql);
