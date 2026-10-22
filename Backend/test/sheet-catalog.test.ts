import { test } from "node:test";
import assert from "node:assert/strict";
import { sheetIssueSchema } from "../src/schemas/sheet.schema.js";
import { catalogSnapshotItem } from "../src/services/sheet-catalog.service.js";

test("emissão recusa qualquer alteração de campos do catálogo no payload", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const body = {
    employeeId: id,
    method: "MANUAL",
    documentDate: "2026-10-22",
    idempotencyKey: id,
    items: [{ variantId: id, quantity: 1 }],
  };
  assert.equal(sheetIssueSchema.parse(body).items[0]!.quantity, 1);
  for (const field of ["description", "ca", "brand", "risk"])
    assert.throws(() =>
      sheetIssueSchema.parse({
        ...body,
        items: [{ ...body.items[0], [field]: "FORJADO" }],
      }),
    );
});
test("snapshot congela somente os valores do catálogo e a data de entrega escolhida", () => {
  const product = {
    description: "Bota",
    ca: "001100",
    brand: "Marca",
    risk_code: "02",
  };
  const saved = catalogSnapshotItem(
    product,
    { id: "v", size: "40" },
    "2026-10-29",
  );
  assert.deepEqual(saved, {
    description: "Bota",
    ca: "001100",
    brand: "Marca",
    risk: "02",
    date: "2026-10-29",
    variantId: "v",
    size: "40",
    quantity: 1,
  });
  product.description = "Novo cadastro";
  assert.equal(saved.description, "Bota");
});
