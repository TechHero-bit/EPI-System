import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import {
  batches,
  normalizeCaNumber,
  parseCaepi,
} from "../src/services/ca-registry.service.js";
import {
  caAlertLevel,
  daysUntil,
} from "../../contracts/ca-alerts.mjs";

// Linhas fictícias no layout do arquivo oficial (pipe, cabeçalho, DD/MM/AAAA).
const sample = [
  "NRRegistroCA|DataValidade|Situacao|NRProcesso|CNPJ|RazaoSocial|Natureza|NomeEquipamento|DescricaoEquipamento|MarcaCA|Referencia",
  "12345|10/01/2027|VÁLIDO|000|00000000000000|FABRICANTE FICTÍCIO LTDA|Nacional|CALÇADO OCUPACIONAL|Botina fictícia|MARCA X|REF",
  "12345|01/01/2026|VÁLIDO|000|00000000000000|FABRICANTE FICTÍCIO LTDA|Nacional|CALÇADO OCUPACIONAL|Botina fictícia|MARCA X|REF2",
  "ABC|01/01/2026|VÁLIDO",
  "",
  "00777|31/02/2025|VENCIDO|000|0|OUTRO|Importado|LUVA|Luva \"fictícia\"|M|R",
];

test("CAEPI: colunas lidas pelo cabeçalho, datas convertidas e linhas inválidas ignoradas", () => {
  const stats = { read: 0, skipped: 0 };
  const rows = [...parseCaepi(sample, stats)];
  assert.equal(stats.read, 4);
  assert.equal(stats.skipped, 1);
  assert.deepEqual(rows[0], {
    ca_number: "12345",
    expires_at: "2027-01-10",
    status: "VÁLIDO",
    equipment_name: "CALÇADO OCUPACIONAL",
    equipment_description: "Botina fictícia",
    manufacturer: "FABRICANTE FICTÍCIO LTDA",
    brand: "MARCA X",
  });
  // Zeros à esquerda do C.A. não são significativos; data inexistente vira nula.
  assert.equal(rows[2]!.ca_number, "777");
  assert.equal(rows[2]!.expires_at, null);
  assert.equal(rows[2]!.equipment_description, "Luva fictícia");
  // Ordem de colunas diferente continua funcionando.
  const swapped = [...parseCaepi(["Situacao|DataValidade|NRRegistroCA", "VENCIDO|05/05/2020|9"])];
  assert.deepEqual([swapped[0]!.ca_number, swapped[0]!.expires_at], ["9", "2020-05-05"]);
  assert.throws(() => [...parseCaepi(["CA|Validade", "1|01/01/2020"])], /Cabeçalho CAEPI/);
});

test("CAEPI: lotes deduplicam o C.A. mantendo a maior validade", () => {
  const out = [...batches(parseCaepi(sample), 1000)];
  assert.equal(out.length, 1);
  assert.equal(out[0]!.length, 2);
  assert.equal(out[0]!.find((r) => r.ca_number === "12345")!.expires_at, "2027-01-10");
  // Entre lotes, a regra da mesma execução fica em import_ca_batch (teste SQL).
  assert.equal([...batches(parseCaepi(sample), 1)].length, 3);
  assert.equal(normalizeCaNumber("CA 004321"), "4321");
  assert.equal(normalizeCaNumber("43.21"), null);
});

test("alertas de C.A.: 30, 15 e 7 dias e vencido; válido no próprio dia", () => {
  const today = "2026-11-09";
  assert.equal(caAlertLevel("2026-11-08", today), "EXPIRED");
  assert.equal(caAlertLevel("2026-11-09", today), "D7");
  assert.equal(caAlertLevel("2026-11-16", today), "D7");
  assert.equal(caAlertLevel("2026-11-17", today), "D15");
  assert.equal(caAlertLevel("2026-11-24", today), "D15");
  assert.equal(caAlertLevel("2026-11-25", today), "D30");
  assert.equal(caAlertLevel("2026-12-09", today), "D30");
  assert.equal(caAlertLevel("2026-12-10", today), null);
  assert.equal(caAlertLevel(null, today), null);
  assert.equal(daysUntil("2027-03-01", "2027-02-27"), 2);
});

test("consulta de C.A., grade de tamanhos e movimentações exigem sessão", async () => {
  assert.equal((await request(app).get("/api/ca/12345")).status, 401);
  assert.equal(
    (await request(app).put("/api/products/11111111-1111-4111-8111-111111111111/sizes").send({ sizes: ["40"] })).status,
    401,
  );
  for (const op of ["receive", "withdraw", "adjust"])
    assert.equal(
      (await request(app).post(`/api/inventory/11111111-1111-4111-8111-111111111111/${op}`).send({})).status,
      401,
    );
});
