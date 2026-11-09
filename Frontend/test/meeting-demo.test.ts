// Mesmas regras da API/SQL aplicadas pelo repositório da demonstração (sem rede).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DemoRepository,
  makeDemoData,
} from "../src/app/core/services/demo-repository.service.ts";
import { caAlertLevel } from "../../contracts/ca-alerts.mjs";
import { today } from "../src/app/core/models/portal.model.ts";

const stockRepo = () => {
  const r = new DemoRepository(makeDemoData());
  r.data.role = "ALMOXARIFADO";
  return r;
};

test("demo 1.1: grade cria variantes; desmarcar com histórico desativa e inativo não entra em ficha", () => {
  const r = stockRepo();
  const p = r.product({ description: "Bota grade", category: "Botas de segurança" });
  const created = r.syncSizes(p.id, ["39", "40", "41"]);
  assert.deepEqual(created.map((c) => c.result), ["CREATED", "CREATED", "CREATED"]);
  assert.throws(() => r.syncSizes(p.id, ["040"]), /padronizada/);
  const v40 = r.data.variants.find((v) => v.product_id === p.id && v.size === "40");
  r.movement(v40.id, "RECEIPT", 2, "Nota fiscal 10");
  const changes = r.syncSizes(p.id, ["39"]);
  assert.deepEqual(
    changes.map((c) => `${c.size}:${c.result}`).sort(),
    ["40:DEACTIVATED", "41:REMOVED"],
  );
  assert.equal(v40.active, false);
  assert.throws(() => r.movement(v40.id, "RECEIPT", 1, "Nota fiscal 11"), /inativo/);
  r.data.role = "RH";
  assert.throws(
    () => r.issue("employee-0", [{ variantId: v40.id, quantity: 1 }], "MANUAL", today(), crypto.randomUUID()),
    /inativo/,
  );
  r.data.role = "ALMOXARIFADO";
  assert.deepEqual(r.syncSizes(p.id, ["39", "40"]), [{ size: "40", result: "REACTIVATED" }]);
});

test("demo 1.3: entrada, retirada e ajuste exigem justificativa e registram o tipo", () => {
  const r = stockRepo();
  assert.throws(() => r.movement("variant-0", "RECEIPT", 1, ""), /justificativa/);
  assert.throws(() => r.movement("variant-0", "WITHDRAWAL", -1, "Retirada"), /válidos/);
  const before = r.data.inventory.find((b) => b.id === "variant-0").stock_quantity;
  r.movement("variant-0", "RECEIPT", 5, "Nota fiscal 77");
  r.movement("variant-0", "WITHDRAWAL", 2, "Retirada para treinamento");
  r.movement("variant-0", "ADJUSTMENT", -1, "Inventário mensal");
  assert.equal(r.data.inventory.find((b) => b.id === "variant-0").stock_quantity, before + 2);
  assert.deepEqual(
    r.data.movements.slice(0, 3).map((m) => `${m.type}:${m.quantity}`),
    ["ADJUSTMENT:-1", "WITHDRAWAL:-2", "RECEIPT:5"],
  );
  assert.throws(() => r.movement("variant-0", "WITHDRAWAL", 9999, "Retirada excessiva"), /insuficiente/);
  r.data.role = "RH";
  assert.throws(() => r.movement("variant-0", "RECEIPT", 1, "Nota fiscal 1"), /perfil/);
});

test("demo 1.2/1.4: consulta de C.A. fictícia e alertas em todos os níveis", () => {
  const r = stockRepo();
  assert.equal(r.caLookup("CA 9900101").expires_at, "2029-06-30");
  assert.throws(() => r.caLookup("123"), /não encontrado/);
  assert.throws(() => r.caLookup("12a"), /números/);
  const levels = r.data.products.map((p) => caAlertLevel(p.ca_expires_at, today()));
  for (const level of ["EXPIRED", "D7", "D15", "D30"]) assert.ok(levels.includes(level as any), level);
  // C.A. vencido bloqueia a emissão.
  const expired = r.data.products.find((p) => caAlertLevel(p.ca_expires_at, today()) === "EXPIRED");
  const variant = r.data.variants.find((v) => v.product_id === expired.id);
  r.data.inventory.find((b) => b.id === variant.id).stock_quantity = 5;
  r.data.role = "RH";
  assert.throws(
    () => r.issue("employee-1", [{ variantId: variant.id, quantity: 1 }], "MANUAL", today(), crypto.randomUUID()),
    /C\.A\. vencido/,
  );
});

test("demo 2.1: listas só para ADMIN, sem duplicatas; colaborador recebe cliente, unidade e RACs", () => {
  const r = new DemoRepository(makeDemoData());
  r.data.role = "RH";
  assert.throws(() => r.listItem("clients", { name: "Novo" }), /perfil/);
  r.data.role = "ADMIN";
  const client = r.listItem("clients", { name: "Cliente Gama" });
  assert.throws(() => r.listItem("clients", { name: " cliente gama " }), /Já existe/);
  r.listItem("clients", { active: false }, client.id);
  assert.equal(client.active, false);
  r.data.role = "RH";
  const saved = r.employee(
    {
      name: "Pessoa Lista",
      registration: "LISTA-1",
      jobTitle: "Auxiliar",
      admissionDate: "2026-01-01",
      clientId: "client-1",
      workUnitId: "unit-1",
      racIds: ["rac-0", "rac-2", "rac-0"],
    },
  );
  assert.equal(saved.work_unit, "Unidade fictícia Sul");
  assert.deepEqual(
    r.data.employeeRacs!.filter((x) => x.employee_id === saved.id).map((x) => x.rac_id),
    ["rac-0", "rac-2"],
  );
  assert.throws(
    () => r.employee({ name: "X Y", registration: "LISTA-2", jobTitle: "A", racIds: ["rac-x"] }),
    /RAC inválido/,
  );
});

test("demo 2.2: kit por cliente e função, até 15 unidades, regravação substitui", () => {
  const r = new DemoRepository(makeDemoData());
  r.data.role = "ALMOXARIFADO";
  assert.throws(() => r.saveKit("client-1", "Auxiliar", [{ productId: "product-1", quantity: 1 }]), /perfil/);
  r.data.role = "RH";
  const kit = r.saveKit("client-1", "Auxiliar", [{ productId: "product-1", quantity: 2 }]);
  assert.equal(r.saveKit("client-1", " auxiliar ", [{ productId: "product-3", quantity: 1 }]).id, kit.id);
  assert.deepEqual(r.data.kitItems!.filter((i) => i.kit_id === kit.id), [
    { kit_id: kit.id, product_id: "product-3", quantity: 1 },
  ]);
  assert.throws(() => r.saveKit("client-1", "Auxiliar", [{ productId: "product-1", quantity: 16 }]), /inválidos/);
  assert.throws(
    () => r.saveKit("client-1", "Auxiliar", [{ productId: "product-1", quantity: 10 }, { productId: "product-2", quantity: 6 }]),
    /15 unidades/,
  );
  r.deleteKit(kit.id);
  assert.equal(r.data.kits!.some((k) => k.id === kit.id), false);
});

test("demo 3.2: devolução de ficha entregue com motivo e destino; snapshot preservado", () => {
  const r = new DemoRepository(makeDemoData());
  r.data.role = "RH";
  const sheet = r.data.sheets.find((s) => s.id === "sheet-2"); // entregue na demonstração
  const snapshot = structuredClone(sheet.snapshot);
  const balance = r.data.inventory.find((b) => b.id === "variant-2");
  const before = { ...balance };
  const body = {
    returnedOn: today(),
    note: "Devolvido em mãos ao RH",
    idempotencyKey: crypto.randomUUID(),
    items: [{ index: 0, reasonCode: 5, destination: "RESTOCK" }],
  };
  assert.throws(() => r.registerReturn("sheet-0", body), /entregues/);
  assert.throws(() => r.registerReturn("sheet-2", { ...body, items: [{ index: 0, reasonCode: 12, destination: "RESTOCK" }] }), /Motivo/);
  assert.throws(() => r.registerReturn("sheet-2", { ...body, note: "" }), /observações/);
  assert.throws(() => r.registerReturn("sheet-2", { ...body, returnedOn: "2099-01-01" }), /Data/);
  const first = r.registerReturn("sheet-2", body);
  assert.equal(r.registerReturn("sheet-2", body).id, first.id);
  assert.equal(balance.stock_quantity, before.stock_quantity + 1);
  assert.equal(balance.reserved_quantity, before.reserved_quantity);
  assert.equal(r.data.movements[0].type, "RETURN");
  assert.throws(
    () => r.registerReturn("sheet-2", { ...body, idempotencyKey: crypto.randomUUID() }),
    /já devolvido/,
  );
  assert.deepEqual(sheet.snapshot, snapshot);
  r.data.role = "ALMOXARIFADO";
  assert.throws(() => r.registerReturn("sheet-2", { ...body, idempotencyKey: crypto.randomUUID() }), /perfil/);
});

test("demo 3.1: cancelamento exige motivo, libera reserva e invalida o link", () => {
  const r = new DemoRepository(makeDemoData());
  r.data.role = "RH";
  const token = r.createSigningLink("sheet-0");
  const reserved = r.data.inventory.find((b) => b.id === "variant-0").reserved_quantity;
  assert.throws(() => r.cancel("sheet-0", "abc"), /motivo/);
  r.cancel("sheet-0", "Troca de tamanho solicitada");
  assert.equal(r.data.inventory.find((b) => b.id === "variant-0").reserved_quantity, reserved - 1);
  assert.throws(() => r.publicSigning(token, ""), /inválido|utilizado/);
  assert.equal(r.data.audits[0].action, "RESERVATION_CANCELLED");
});

test("demo 4.1/4.2: CPF de teste em todos; confirmação exige nome e dígitos; 5 erros bloqueiam o link", () => {
  const r = new DemoRepository(makeDemoData());
  assert.ok(r.data.employees.every((e) => e.cpf === "93492854010"));
  // O snapshot da ficha nunca carrega o CPF.
  assert.ok(r.data.sheets.every((s) => !JSON.stringify(s.snapshot).includes("93492854010")));
  r.data.role = "RH";
  const token = r.createSigningLink("sheet-0");
  r.publicSigning(token, "code");
  const preview = r.publicSigning(token, "preview");
  assert.equal(preview.identityRequired, true);
  assert.ok(!JSON.stringify(preview).includes("93492854010"));
  const attempt = (cpfStart: string, cpfEnd: string, name = "Ana Martins") =>
    r.publicSigning(token, "confirm", true, {
      signerName: name,
      signatureStyle: "classic",
      termsVersion: "EPI-ELECTRONIC-SIMPLE-V2",
      cpfStart,
      cpfEnd,
    });
  assert.throws(() => attempt("934", "011"), /não conferem/);
  assert.throws(() => attempt("934", "010", "Ana Marins"), /não conferem/);
  for (let i = 0; i < 2; i++) assert.throws(() => attempt("000", "000"), /não conferem/);
  assert.throws(() => attempt("111", "111"), /bloqueado/);
  assert.throws(() => attempt("934", "010"), /bloqueado/);
  // RH gera outro link e a assinatura correta conclui.
  const second = r.createSigningLink("sheet-0");
  r.publicSigning(second, "code");
  r.publicSigning(second, "preview");
  r.publicSigning(second, "confirm", true, {
    signerName: "Ana Martins",
    signatureStyle: "classic",
    termsVersion: "EPI-ELECTRONIC-SIMPLE-V2",
    cpfStart: "934",
    cpfEnd: "010",
  });
  assert.equal(r.data.states.find((s) => s.sheet_id === "sheet-0").signature_status, "SIGNED_ELECTRONIC");
});
