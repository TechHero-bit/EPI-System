import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreReviewDraft } from "../src/app/shared/utils/review-draft.ts";
import { DemoRepository } from "../src/app/core/services/demo-repository.service.ts";

test("retorno recupera colaborador, método, equipamentos e datas sem copiar campos do catálogo", () => {
  const sheet = {
    employee_id: "e",
    signature_method: "ELECTRONIC",
    snapshot: {
      documentDate: "2026-10-22",
      items: [
        {
          variantId: "v",
          quantity: 1,
          date: "2026-10-29",
          description: "Bota",
          ca: "123",
          brand: "Marca",
          risk: "02",
        },
      ],
    },
  };
  const saved = structuredClone(sheet);
  assert.deepEqual(restoreReviewDraft(sheet), {
    employeeId: "e",
    date: "2026-10-22",
    method: "ELECTRONIC",
    items: [{ variantId: "v", quantity: 1, deliveryDate: "2026-10-29" }],
  });
  assert.deepEqual(sheet, saved);
  assert.equal(
    restoreReviewDraft({
      ...sheet,
      items: [{ variantId: "demo-v" }],
      snapshot: {
        ...sheet.snapshot,
        items: [{ date: "2026-10-29", quantity: 1 }],
      },
    }).items[0]!.variantId,
    "demo-v",
  );
});
test("retorno recusa revisão incompleta e quantidade inválida sem adivinhar equipamento", () => {
  assert.throws(() => restoreReviewDraft({}), /preservada/);
  const base = {
    employee_id: "e",
    signature_method: "MANUAL",
    snapshot: {
      documentDate: "2026-10-22",
      items: [{ date: "2026-10-29", quantity: 1 }],
    },
  };
  assert.throws(() => restoreReviewDraft(base), /preservada/);
  assert.throws(
    () =>
      restoreReviewDraft({
        ...base,
        snapshot: {
          ...base.snapshot,
          items: [{ variantId: "v", quantity: 2 }],
        },
      }),
    /preservada/,
  );
});
test("cancelar para voltar invalida link, libera reserva e preserva a versão anterior", () => {
  const r = new DemoRepository();
  const initial = r.data.inventory[0].reserved_quantity;
  const old = r.issue(
    "employee-0",
    [{ variantId: "variant-0", quantity: 1, deliveryDate: "2026-10-29" }],
    "ELECTRONIC",
    "2026-10-22",
    crypto.randomUUID(),
  );
  const frozen = structuredClone(old.snapshot);
  const token = r.createSigningLink(old.id);
  const draft = restoreReviewDraft(old);
  r.cancel(old.id, "Retorno para edição da ficha");
  assert.equal(r.data.inventory[0].reserved_quantity, initial);
  assert.throws(() => r.publicSigning(token, ""), /utilizado/);
  const next = r.issue(
    draft.employeeId,
    draft.items,
    "MANUAL",
    draft.date,
    crypto.randomUUID(),
  );
  assert.notEqual(next.id, old.id);
  assert.equal(next.signature_method, "MANUAL");
  assert.equal(next.version, old.version + 1);
  assert.equal(next.employee_registration, old.employee_registration);
  assert.deepEqual(old.snapshot, frozen);
  assert.equal(next.snapshot.items[0]!.date, "2026-10-29");
  assert.equal(
    r.data.audits.find(
      (event) =>
        event.entity_id === old.id && event.action === "RESERVATION_CANCELLED",
    ).detail.reason,
    "Retorno para edição da ficha",
  );
});
