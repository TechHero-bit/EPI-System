import { test } from "node:test";
import assert from "node:assert/strict";
import { alphabetical } from "../src/app/shared/utils/alphabetical.ts";
import {
  DemoRepository,
  makeDemoData,
} from "../src/app/core/services/demo-repository.service.ts";
const item = {
  variantId: "variant-0",
  lotId: "lot-0",
  quantity: 1 as const,
  risk: "",
};
test("ordenação pt-BR trata acentos e tamanhos numéricos sem alterar o original", () => {
  const labels = ["Único", "Luva 10", "Bota", "Árvore", "Luva 2"];
  assert.deepEqual(
    alphabetical(labels, (s) => s),
    ["Árvore", "Bota", "Luva 2", "Luva 10", "Único"],
  );
  assert.equal(labels[0], "Único");
});
test("registro incrementa por ficha, preserva datas e alterações dos campos amarelos", () => {
  const repository = new DemoRepository();
  repository.data.role = "RH";
  const key = crypto.randomUUID();
  const edited = {
    ...item,
    deliveryDate: "2026-10-29",
    description: "PAR DE BOTAS",
    ca: "27300",
    brand: "BRACOL",
    risk: "02",
  };
  const first = repository.issue(
    "employee-0",
    [edited],
    "MANUAL",
    "2026-10-25",
    key,
  );
  const second = repository.issue(
    "employee-0",
    [edited],
    "MANUAL",
    "2026-10-25",
    crypto.randomUUID(),
  );
  assert.equal(first.record_number, 5);
  assert.equal(second.record_number, 6);
  assert.equal(
    repository.issue("employee-0", [edited], "MANUAL", "2026-10-25", key)
      .record_number,
    5,
  );
  assert.deepEqual(first.snapshot.items[0], {
    description: "PAR DE BOTAS",
    ca: "27300",
    brand: "BRACOL",
    risk: "02",
    date: "2026-10-29",
    size: "40",
    lot: "DEMO-2026-1",
    quantity: 1,
  });
  assert.equal(first.snapshot.issuedAt, first.issued_at);
  repository.cancel(second.id);
  const reloaded = new DemoRepository(structuredClone(repository.data));
  assert.equal(
    reloaded.issue(
      "employee-1",
      [item],
      "MANUAL",
      "2026-10-30",
      crypto.randomUUID(),
    ).record_number,
    7,
  );
});
test("demonstração possui dez colaboradores e quatro categorias fictícias", () => {
  const d = makeDemoData();
  assert.equal(d.employees.length, 10);
  assert.equal(new Set(d.products.map((p) => p.category)).size, 4);
  assert.ok(
    d.employees.every((e) => e.personal_email.endsWith("@example.invalid")),
  );
});
test("cadastros de colaborador e produto funcionam e respeitam perfis", () => {
  const r = new DemoRepository();
  const p = r.product({
    description: "EPI de teste",
    category: "Nova categoria",
    photoUrl: "https://example.invalid/epi.png",
    usefulLifeDays: 180,
  });
  assert.ok(r.data.products.includes(p));
  r.product(
    { description: "EPI atualizado", category: "Nova categoria" },
    p.id,
  );
  assert.equal(p.photo_url, "https://example.invalid/epi.png");
  assert.equal(p.useful_life_days, 180);
  r.employee({
    name: "Pessoa Teste",
    registration: "NEW",
    jobTitle: "Operador",
    department: "Operações",
    admissionDate: "2026-10-20",
  });
  r.data.role = "ALMOXARIFADO";
  assert.throws(() => r.employee({}), /perfil/);
  r.data.role = "RH";
  assert.throws(() => r.product({}), /perfil/);
});
test("entrada e ajuste nunca geram saldo negativo", () => {
  const r = new DemoRepository();
  const l = r.data.lots[0];
  const before = l.stock_quantity;
  r.movement(l.id, 3, "Entrada");
  assert.equal(l.stock_quantity, before + 3);
  assert.throws(() => r.movement(l.id, -999, "Inventário", true), /Saldo/);
});
test("ficha com múltiplos EPIs reserva uma unidade por linha e é idempotente", () => {
  const r = new DemoRepository();
  const before = r.data.lots[0].stock_quantity;
  const reserved = r.data.lots[0].reserved_quantity;
  const f = r.issue(
    "employee-0",
    [item, { ...item, variantId: "variant-2", lotId: "lot-2" }],
    "ELECTRONIC",
    "2026-10-20",
    "key",
  );
  assert.equal(r.data.lots[0].stock_quantity, before);
  assert.equal(r.data.lots[0].reserved_quantity, reserved + 1);
  assert.equal(
    r.issue(
      "employee-0",
      [item, { ...item, variantId: "variant-2", lotId: "lot-2" }],
      "ELECTRONIC",
      "2026-10-20",
      "key",
    ).id,
    f.id,
  );
  assert.ok(f.snapshot.items.every((i) => i.quantity === 1));
  assert.throws(
    () =>
      r.issue(
        "employee-0",
        [{ ...item, quantity: 2 as 1 }],
        "MANUAL",
        "2026-10-20",
        "bad",
      ),
    /Quantidade/,
  );
});
test("assinatura simulada não confirma entrega nem baixa estoque", () => {
  const r = new DemoRepository();
  const before = r.data.lots[0].stock_quantity;
  const f = r.issue("employee-0", [item], "ELECTRONIC", "2026-10-20", "k");
  r.sign(f.id);
  assert.equal(
    r.data.states.find((s) => s.sheet_id === f.id).receipt_status,
    "UNCONFIRMED",
  );
  assert.equal(r.data.lots[0].stock_quantity, before);
  assert.throws(() => r.sign(f.id), /utilizada/);
  r.receipt(f.id, "Entrega presencial demonstrativa");
  assert.equal(r.data.lots[0].stock_quantity, before - 1);
  r.receipt(f.id, "Repetição");
  assert.equal(r.data.lots[0].stock_quantity, before - 1);
});
test("cancelar libera reserva e não altera estoque físico", () => {
  const r = new DemoRepository();
  const l = r.data.lots[0];
  const initial = r.available(l);
  const f = r.issue("employee-0", [item], "MANUAL", "2026-10-20", "k");
  assert.equal(r.available(l), initial - 1);
  r.cancel(f.id);
  assert.equal(r.available(l), initial);
  assert.throws(() => r.receipt(f.id, "Entrega"), /indisponível/);
  assert.ok(r.data.audits.some((a) => a.action === "RESERVATION_CANCELLED"));
});
