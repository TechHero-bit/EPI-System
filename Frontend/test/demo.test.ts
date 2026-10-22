import { test } from "node:test";
import assert from "node:assert/strict";
import { alphabetical } from "../src/app/shared/utils/alphabetical.ts";
import {
  DemoRepository,
  makeDemoData,
} from "../src/app/core/services/demo-repository.service.ts";
const item = {
  variantId: "variant-0",
  quantity: 1 as const,
};
test("ordenação pt-BR trata acentos e tamanhos numéricos sem alterar o original", () => {
  const labels = ["Único", "Luva 10", "Bota", "Árvore", "Luva 2"];
  assert.deepEqual(
    alphabetical(labels, (s) => s),
    ["Árvore", "Bota", "Luva 2", "Luva 10", "Único"],
  );
  assert.equal(labels[0], "Único");
});
test("registro usa a matrícula em todas as fichas do colaborador e preserva datas", () => {
  const repository = new DemoRepository();
  repository.data.role = "RH";
  const key = crypto.randomUUID();
  const edited = {
    ...item,
    deliveryDate: "2026-10-29",
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
  assert.equal(first.employee_registration, "DEMO-001");
  assert.equal(second.employee_registration, "DEMO-001");
  assert.equal(
    repository.issue("employee-0", [edited], "MANUAL", "2026-10-25", key)
      .employee_registration,
    "DEMO-001",
  );
  assert.deepEqual(first.snapshot.items[0], {
    description: "Bota de segurança em couro",
    ca: "DEMO-1100",
    brand: "Proteção Demo",
    risk: "",
    date: "2026-10-29",
    size: "40",
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
    ).employee_registration,
    "DEMO-002",
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
test("RH não pode sobrescrever campos do catálogo durante a emissão", () => {
  const r = new DemoRepository();
  r.data.role = "RH";
  for (const field of ["description", "ca", "brand", "risk"])
    assert.throws(
      () =>
        r.issue(
          "employee-0",
          [{ ...item, [field]: "FORJADO" }] as any,
          "MANUAL",
          "2026-10-22",
          crypto.randomUUID(),
        ),
      /Almoxarifado/,
    );
  const first = r.issue(
    "employee-0",
    [item],
    "MANUAL",
    "2026-10-22",
    crypto.randomUUID(),
  );
  r.data.role = "ALMOXARIFADO";
  r.product(
    {
      description: "Bota atualizada",
      category: "Botas de segurança",
      brand: "Nova marca",
      ca: "009900",
      riskCode: "02",
    },
    "product-0",
  );
  r.data.role = "RH";
  const next = r.issue(
    "employee-0",
    [item],
    "MANUAL",
    "2026-10-22",
    crypto.randomUUID(),
  );
  assert.equal(
    first.snapshot.items[0]!.description,
    "Bota de segurança em couro",
  );
  assert.equal(next.snapshot.items[0]!.description, "Bota atualizada");
  assert.equal(next.snapshot.items[0]!.ca, "009900");
  assert.equal(next.snapshot.items[0]!.risk, "02");
});
test("link aleatório da revisão exige conferência e aceite e não confirma entrega", () => {
  const r = new DemoRepository();
  const f = r.issue(
    "employee-0",
    [item],
    "ELECTRONIC",
    "2026-10-22",
    crypto.randomUUID(),
  );
  const physical = r.data.inventory[0].stock_quantity;
  const token = r.createSigningLink(f.id),
    other = r.createSigningLink(f.id);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(token, other);
  assert.throws(() => r.publicSigning(f.id, ""), /Link inválido/);
  assert.throws(() => r.publicSigning(token, "confirm", true), /Confira/);
  r.publicSigning(token, "code");
  r.publicSigning(token, "preview");
  assert.throws(() => r.publicSigning(token, "confirm", false), /aceite/);
  r.publicSigning(token, "confirm", true);
  const state = r.data.states.find((state) => state.sheet_id === f.id);
  assert.equal(state.signature_status, "SIGNED_ELECTRONIC");
  assert.equal(state.receipt_status, "UNCONFIRMED");
  assert.equal(r.data.inventory[0].stock_quantity, physical);
  assert.throws(() => r.publicSigning(token, ""), /utilizado/);
  assert.throws(() => r.publicSigning(other, ""), /utilizado/);
  const pending = r.issue(
    "employee-1",
    [item],
    "ELECTRONIC",
    "2026-10-22",
    crypto.randomUUID(),
  );
  const expired = r.createSigningLink(pending.id);
  r.data.signingLinks!.find((link) => link.token === expired)!.expires_at =
    Date.now() - 1;
  assert.throws(() => r.publicSigning(expired, ""), /expirado/);
  r.cancel(pending.id);
  assert.throws(() => r.createSigningLink(pending.id), /indisponível/);
});
test("cadastro manual rejeita matrícula duplicada e mantém zeros no registro", () => {
  const repository = new DemoRepository();
  repository.data.role = "RH";
  const employee = repository.employee({
    name: "Funcionário manual",
    registration: "000546",
    jobTitle: "Técnico",
    department: "Operações",
    admissionDate: "2026-10-01",
  });
  assert.throws(
    () =>
      repository.employee({
        name: "Duplicado",
        registration: " 000546 ",
        jobTitle: "Técnico",
      }),
    /Matrícula já cadastrada/,
  );
  const a = repository.issue(
    employee.id,
    [item],
    "MANUAL",
    "2026-10-25",
    crypto.randomUUID(),
  );
  const b = repository.issue(
    employee.id,
    [item],
    "MANUAL",
    "2026-10-26",
    crypto.randomUUID(),
  );
  assert.equal(a.snapshot.recordNumber, "000546");
  assert.equal(b.snapshot.recordNumber, "000546");
  assert.equal(b.version, 2);
  assert.ok(!("lotId" in a.items[0]));
});
test("migração da demonstração consolida saldos e preserva bloqueios históricos", () => {
  const data: any = makeDemoData();
  data.lots = [
    {
      id: "legacy-a",
      variant_id: "variant-0",
      stock_quantity: 5,
      reserved_quantity: 1,
      condition: "NOVO",
    },
    {
      id: "legacy-b",
      variant_id: "variant-0",
      stock_quantity: 4,
      reserved_quantity: 0,
      condition: "AVARIADO",
    },
  ];
  delete data.inventory;
  const repo = new DemoRepository(data),
    row = repo.data.inventory.find((row) => row.id === "variant-0");
  assert.equal(row.stock_quantity, 9);
  assert.equal(row.reserved_quantity, 1);
  assert.equal(row.blocked_quantity, 4);
  assert.equal(repo.available(row), 4);
  repo.receipt("sheet-0", "Entrega após migração");
  assert.equal(row.stock_quantity, 8);
  assert.equal(repo.available(row), 4);
  assert.equal(data.lots[0].stock_quantity, 5);
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
  const l = r.data.inventory[0];
  const before = l.stock_quantity;
  r.movement(l.id, 3, "Entrada");
  assert.equal(l.stock_quantity, before + 3);
  assert.throws(() => r.movement(l.id, -999, "Inventário", true), /Saldo/);
});
test("ficha com múltiplos EPIs reserva uma unidade por linha e é idempotente", () => {
  const r = new DemoRepository();
  const before = r.data.inventory[0].stock_quantity;
  const reserved = r.data.inventory[0].reserved_quantity;
  const f = r.issue(
    "employee-0",
    [item, { ...item, variantId: "variant-2" }],
    "ELECTRONIC",
    "2026-10-20",
    "key",
  );
  assert.equal(r.data.inventory[0].stock_quantity, before);
  assert.equal(r.data.inventory[0].reserved_quantity, reserved + 1);
  assert.equal(
    r.issue(
      "employee-0",
      [item, { ...item, variantId: "variant-2" }],
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
  const before = r.data.inventory[0].stock_quantity;
  const f = r.issue("employee-0", [item], "ELECTRONIC", "2026-10-20", "k");
  r.sign(f.id);
  assert.equal(
    r.data.states.find((s) => s.sheet_id === f.id).receipt_status,
    "UNCONFIRMED",
  );
  assert.equal(r.data.inventory[0].stock_quantity, before);
  assert.throws(() => r.sign(f.id), /utilizada/);
  r.receipt(f.id, "Entrega presencial demonstrativa");
  assert.equal(r.data.inventory[0].stock_quantity, before - 1);
  r.receipt(f.id, "Repetição");
  assert.equal(r.data.inventory[0].stock_quantity, before - 1);
});
test("cancelar libera reserva e não altera estoque físico", () => {
  const r = new DemoRepository();
  const l = r.data.inventory[0];
  const initial = r.available(l);
  const f = r.issue("employee-0", [item], "MANUAL", "2026-10-20", "k");
  assert.equal(r.available(l), initial - 1);
  r.cancel(f.id);
  assert.equal(r.available(l), initial);
  assert.throws(() => r.receipt(f.id, "Entrega"), /indisponível/);
  assert.ok(r.data.audits.some((a) => a.action === "RESERVATION_CANCELLED"));
});
