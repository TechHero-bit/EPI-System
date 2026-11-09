// Regras da reunião de validação (migrations 010+), executadas em PostgreSQL WASM (PGlite).
// Contratos mínimos Auth/Storage, sem rede. Não substitui teste com Supabase hospedado.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const org = "10000000-0000-4000-8000-000000000001",
  other = "20000000-0000-4000-8000-000000000001";
const admin = "31000000-0000-4000-8000-000000000001",
  rh = "31000000-0000-4000-8000-000000000002",
  stock = "31000000-0000-4000-8000-000000000003",
  outsider = "31000000-0000-4000-8000-000000000004";
const prelude = `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid()to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`;
export const one = async (sql: string, params: any[] = []) =>
  (await db.query<any>(sql, params)).rows[0];
export const all = async (sql: string, params: any[] = []) =>
  (await db.query<any>(sql, params)).rows;
let product: string, employee: string;

before(async () => {
  await db.exec(prelude);
  for (const name of (await readdir("database/supabase/migrations")).sort())
    await db.exec(
      await readFile(`database/supabase/migrations/${name}`, "utf8"),
    );
  await db.exec(await readFile("database/supabase/seed.sql", "utf8"));
  await db.query("insert into auth.users(id)values($1),($2),($3),($4)", [
    admin,
    rh,
    stock,
    outsider,
  ]);
  await db.query(
    "insert into public.organizations(id,name)values($1,'Outra empresa')",
    [other],
  );
  await db.query(
    "insert into public.memberships(organization_id,user_id,role)values($1,$2,'ADMIN'),($1,$3,'RH'),($1,$4,'ALMOXARIFADO'),($5,$6,'ADMIN')",
    [org, admin, rh, stock, other, outsider],
  );
  product = (
    await one(
      "insert into products(organization_id,category,description,ca,brand)values($1,'Botas de segurança','Bota com grade','12345','Marca')returning id",
      [org],
    )
  ).id;
  employee = (
    await one("select id from employees where organization_id=$1 order by registration limit 1", [org])
  ).id;
});
after(async () => {
  await db.close();
});

const sync = (sizes: string[], actor = stock, id = product) =>
  one("select sync_product_sizes($1,$2,$3,$4)as r", [org, actor, id, sizes]);
const variantOf = async (size: string) =>
  one("select v.*,s.stock_quantity from variants v join inventory_stock s on s.id=v.id where v.product_id=$1 and v.size=$2", [product, size]);
const move = (variant: string, operation: string, quantity: number, reason = "Nota fiscal 123", actor = stock, key = crypto.randomUUID()) =>
  one("select move_inventory($1,$2,$3,$4,$5,$6,$7)as n", [org, actor, variant, operation, quantity, reason, key]);

export async function issueFor(
  items: { variant_id: string }[],
  method = "MANUAL",
  actor = rh,
  employeeId = employee,
) {
  const e = await one("select name,registration from employees where id=$1", [employeeId]);
  const key = crypto.randomUUID();
  const snapshot = {
    requestKey: key,
    recordNumber: e.registration,
    employee: { registration: e.registration, name: e.name },
    documentDate: "2026-11-09",
    items: items.map((i) => ({ variantId: i.variant_id, quantity: 1 })),
  };
  return (
    await one("select issue_sheet($1,$2,$3,$4,$5,$6,$7,$8,$9)as id", [
      org,
      actor,
      employeeId,
      JSON.stringify(snapshot),
      "a".repeat(64),
      "b".repeat(64),
      `${key}.pdf`,
      method,
      JSON.stringify(items.map((i) => ({ ...i, quantity: 1 }))),
    ])
  ).id as string;
}

test("1.1 grade: cada tamanho marcado vira variante, valores fora do contrato são recusados", async () => {
  const created = (await sync(["38", "39", "40", "41", "42", "43", "44"])).r;
  assert.equal(created.length, 7);
  assert.ok(created.every((c: any) => c.result === "CREATED"));
  assert.equal(
    (await one("select count(*)::int n from variants where product_id=$1 and active", [product])).n,
    7,
  );
  await assert.rejects(sync(["040"]), /padronizada/);
  await assert.rejects(sync(["45", "XS"]), /padronizada/);
  await assert.rejects(sync(["40"], rh), /negado/);
  await assert.rejects(sync([]), /ao menos um/);
  // Repetir a mesma grade não cria duplicatas.
  assert.deepEqual((await sync(["38", "39", "40", "41", "42", "43", "44"])).r, []);
});

test("1.1 desmarcar tamanho com saldo ou histórico desativa; sem histórico remove", async () => {
  const v40 = await variantOf("40");
  await move(v40.id, "RECEIPT", 3);
  const changes = (await sync(["38", "39", "41", "42", "43"])).r;
  assert.deepEqual(
    changes.map((c: any) => `${c.size}:${c.result}`).sort(),
    ["40:DEACTIVATED", "44:REMOVED"],
  );
  assert.equal((await variantOf("40")).active, false);
  assert.equal(await variantOf("44"), undefined);
  // Inativo não aceita nova ficha nem entrada; saldo continua registrado.
  await assert.rejects(issueFor([{ variant_id: v40.id }]), /Sem estoque válido/);
  await assert.rejects(move(v40.id, "RECEIPT", 1), /inativo/);
  assert.equal((await variantOf("40")).stock_quantity, 3);
  // Marcar novamente reativa o mesmo registro.
  const back = (await sync(["38", "39", "40", "41", "42", "43"])).r;
  assert.deepEqual(back, [{ size: "40", result: "REACTIVATED" }]);
  assert.equal((await variantOf("40")).id, v40.id);
});

test("1.3 entrada, retirada e ajuste exigem justificativa e são idempotentes", async () => {
  const v = (await variantOf("41")).id;
  await assert.rejects(move(v, "RECEIPT", 5, ""), /Justificativa/);
  await assert.rejects(move(v, "RECEIPT", 5, "nf"), /Justificativa/);
  await assert.rejects(move(v, "RECEIPT", -5), /inválida/);
  await assert.rejects(move(v, "WITHDRAWAL", -1), /inválida/);
  await assert.rejects(move(v, "TRANSFER", 1), /inválida/);
  const key = crypto.randomUUID();
  assert.equal((await move(v, "RECEIPT", 10, "Nota fiscal 555", stock, key)).n, 10);
  assert.equal((await move(v, "RECEIPT", 10, "Nota fiscal 555", stock, key)).n, 10);
  await assert.rejects(move(v, "RECEIPT", 11, "Nota fiscal 555", stock, key), /reutilizada/);
  assert.equal((await move(v, "WITHDRAWAL", 2, "Retirada para teste de campo")).n, 8);
  assert.equal((await move(v, "ADJUSTMENT", -1, "Inventário mensal")).n, 7);
  assert.equal((await move(v, "ADJUSTMENT", 2, "Inventário mensal")).n, 9);
  await assert.rejects(move(v, "WITHDRAWAL", 100, "Retirada maior que o saldo"), /insuficiente/);
  await assert.rejects(move(v, "RECEIPT", 1, "Entrada sem permissão", rh), /negado/);
  const rows = await all(
    "select type,quantity,reason from stock_movements where variant_id=$1 order by created_at,quantity",
    [v],
  );
  assert.deepEqual(
    rows.map((r) => `${r.type}:${r.quantity}`).sort(),
    ["ADJUSTMENT:-1", "ADJUSTMENT:2", "RECEIPT:10", "WITHDRAWAL:-2"],
  );
  assert.ok(rows.every((r) => r.reason.length >= 5));
  await assert.rejects(
    one("insert into stock_movements(organization_id,variant_id,type,quantity,reason)values($1,$2,'WITHDRAWAL',1,'x')", [org, v]),
    /withdrawal_negative/,
  );
});

test("1.2 importação CAEPI em lotes é idempotente e mantém a maior validade do mesmo C.A.", async () => {
  const run = "2026-11-09T20:00:00Z";
  const rows = [
    { ca_number: "12345", expires_at: "2027-01-10", status: "VÁLIDO", equipment_name: "BOTINA", manufacturer: "Fabricante A" },
    { ca_number: "777", expires_at: "2025-01-01", status: "VENCIDO", equipment_name: "LUVA" },
  ];
  await one("select import_ca_batch($1,$2)", [run, JSON.stringify(rows)]);
  // Mesmo C.A. em outra linha do mesmo arquivo, com validade menor: não sobrescreve.
  await one("select import_ca_batch($1,$2)", [run, JSON.stringify([{ ...rows[0], expires_at: "2026-01-01" }])]);
  assert.equal((await one("select expires_at::text e from ca_registry where ca_number='12345'")).e, "2027-01-10");
  // Nova execução substitui (validade pode ter sido revista).
  await one("select import_ca_batch($1,$2)", ["2026-11-10T20:00:00Z", JSON.stringify([{ ...rows[0], expires_at: "2028-05-05" }])]);
  assert.equal((await one("select expires_at::text e from ca_registry where ca_number='12345'")).e, "2028-05-05");
  assert.equal((await one("select count(*)::int n from ca_registry")).n, 2);
  await assert.rejects(
    one("select import_ca_batch($1,$2)", [run, JSON.stringify([{ ca_number: "12a" }])]),
    /ca_registry_ca_number_check/,
  );
  // Sem acesso direto por REST: tabela fechada para authenticated.
  assert.equal(
    (await one("select has_table_privilege('authenticated','public.ca_registry','select')as ok")).ok,
    false,
  );
});

test("1.4 ficha com C.A. vencido continua bloqueada no banco", async () => {
  const v = (await variantOf("42")).id;
  await move(v, "RECEIPT", 2);
  await db.query("update products set ca_expires_at=current_date-1 where id=$1", [product]);
  await assert.rejects(issueFor([{ variant_id: v }]), /Sem estoque válido/);
  await db.query("update products set ca_expires_at=current_date where id=$1", [product]);
  const id = await issueFor([{ variant_id: v }]);
  assert.ok(id);
  await one("select cancel_reservation($1,$2,$3,$4)", [org, rh, id, "Fim do teste"]);
  await db.query("update products set ca_expires_at=null where id=$1", [product]);
});

test("2.1 migration 011 converte work_unit existente em itens da lista sem perder dados", async () => {
  const existing = new PGlite();
  try {
    await existing.exec(prelude);
    const files = (await readdir("database/supabase/migrations")).sort();
    for (const file of files.filter((f) => f < "011"))
      await existing.exec(await readFile(`database/supabase/migrations/${file}`, "utf8"));
    await existing.query("insert into organizations(id,name)values($1,'Org teste'),($2,'Org dois')", [org, other]);
    await existing.query(
      `insert into employees(organization_id,name,registration,job_title,admission_date,work_unit)values
       ($1,'Pessoa Um','001','Operador','2026-01-01','Unidade Norte'),
       ($1,'Pessoa Dois','002','Operador','2026-01-01','  unidade norte '),
       ($1,'Pessoa Três','003','Operador','2026-01-01',''),
       ($2,'Pessoa Quatro','004','Operador','2026-01-01','Unidade Norte')`,
      [org, other],
    );
    for (const file of files.filter((f) => f >= "011"))
      await existing.exec(await readFile(`database/supabase/migrations/${file}`, "utf8"));
    const units = (await existing.query<any>("select organization_id,name from work_units order by organization_id")).rows;
    assert.equal(units.length, 2);
    const rows = (
      await existing.query<any>(
        "select e.registration,e.work_unit,u.name unit,u.organization_id=e.organization_id same_org from employees e left join work_units u on u.id=e.work_unit_id order by registration",
      )
    ).rows;
    assert.deepEqual(
      rows.map((r) => [r.registration, r.work_unit, r.unit, r.same_org]),
      [
        ["001", "Unidade Norte", "Unidade Norte", true],
        ["002", "  unidade norte ", "Unidade Norte", true],
        ["003", "", null, null],
        ["004", "Unidade Norte", "Unidade Norte", true],
      ],
    );
  } finally {
    await existing.close();
  }
});

test("2.1 listas: nomes únicos por organização, vínculos isolados e RACs atômicos", async () => {
  const client = (await one("insert into clients(organization_id,name)values($1,'Cliente Alfa')returning id", [org])).id;
  await assert.rejects(one("insert into clients(organization_id,name)values($1,' cliente alfa')", [org]), /clients_name_unique/);
  const foreign = (await one("insert into clients(organization_id,name)values($1,'Cliente Alfa')returning id", [other])).id;
  const unit = (await one("insert into work_units(organization_id,name)values($1,'Unidade Centro')returning id", [org])).id;
  const [r1, r2] = (await all("insert into racs(organization_id,name)values($1,'RAC 01'),($1,'RAC 02')returning id", [org])).map((r) => r.id);
  const foreignRac = (await one("insert into racs(organization_id,name)values($1,'RAC 01')returning id", [other])).id;
  await db.query("update employees set client_id=$1,work_unit_id=$2 where id=$3", [client, unit, employee]);
  await assert.rejects(db.query("update employees set client_id=$1 where id=$2", [foreign, employee]), /outra organização/);
  await one("select set_employee_racs($1,$2,$3,$4)", [org, rh, employee, [r1, r2]]);
  await one("select set_employee_racs($1,$2,$3,$4)", [org, rh, employee, [r2]]);
  assert.deepEqual((await all("select rac_id from employee_racs where employee_id=$1", [employee])).map((r) => r.rac_id), [r2]);
  await assert.rejects(one("select set_employee_racs($1,$2,$3,$4)", [org, rh, employee, [foreignRac]]), /RAC inválido/);
  await assert.rejects(one("select set_employee_racs($1,$2,$3,$4)", [org, stock, employee, [r1]]), /negado/);
  // Almoxarifado não lê as listas de RH por REST; RH lê.
  await db.exec("set role authenticated");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [stock]);
    assert.equal((await all("select * from clients")).length, 0);
    assert.equal((await all("select * from employee_racs")).length, 0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [rh]);
    assert.deepEqual((await all("select name from clients")).map((c) => c.name), ["Cliente Alfa"]);
    await assert.rejects(db.query("insert into clients(organization_id,name)values($1,'Direto')", [org]), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});

test("2.2 kit por cliente e função: ADMIN/RH, até 15 unidades, regravação substitui itens", async () => {
  const client = (await one("select id from clients where organization_id=$1 and name='Cliente Alfa'", [org])).id;
  const products = (await all("select id from products where organization_id=$1 order by description limit 2", [org])).map((p) => p.id);
  const save = (items: any[], actor = rh, job = "Operador(a)") =>
    one("select save_epi_kit($1,$2,$3,$4,$5)as id", [org, actor, client, job, JSON.stringify(items)]);
  const kit = (await save([{ product_id: products[0], quantity: 2 }, { product_id: products[1], quantity: 1 }])).id;
  assert.equal((await save([{ product_id: products[0], quantity: 3 }], admin, " operador(a) ")).id, kit);
  assert.deepEqual(await all("select product_id,quantity from epi_kit_items where kit_id=$1", [kit]), [
    { product_id: products[0], quantity: 3 },
  ]);
  await assert.rejects(save([{ product_id: products[0], quantity: 16 }]), /inválidos/);
  await assert.rejects(save([{ product_id: products[0], quantity: 10 }, { product_id: products[1], quantity: 6 }]), /15 unidades/);
  await assert.rejects(save([]), /ao menos um/);
  await assert.rejects(save([{ product_id: products[0], quantity: 1 }], stock), /negado/);
  const foreignProduct = (await one("insert into products(organization_id,category,description)values($1,'X','Outro')returning id", [other])).id;
  await assert.rejects(save([{ product_id: foreignProduct, quantity: 1 }]), /inválidos/);
});

const registerReturn = (sheet: string, items: any[], opts: { key?: string; date?: string; note?: string; actor?: string; termination?: boolean } = {}) =>
  one("select register_sheet_return($1,$2,$3,$4,$5,$6,$7,$8)as id", [
    org,
    opts.actor ?? rh,
    sheet,
    opts.date ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()),
    opts.note ?? "Devolvido em mãos; documento arquivado na pasta do colaborador",
    JSON.stringify(items),
    opts.termination ?? false,
    opts.key ?? crypto.randomUUID(),
  ]);

test("3.2 devolução: só ficha entregue, motivo por item, destino define estoque, sem tocar no snapshot", async () => {
  const v = (await variantOf("43")).id;
  await move(v, "RECEIPT", 5);
  await db.query("update inventory_stock set blocked_quantity=1 where id=$1", [v]);
  const sheet = await issueFor([{ variant_id: v }, { variant_id: v }, { variant_id: v }]);
  const before = await one("select snapshot,snapshot_sha256,pdf_sha256 from sheets where id=$1", [sheet]);
  await assert.rejects(registerReturn(sheet, [{ item_index: 0, reason_code: 5, destination: "RESTOCK" }]), /entregues/);
  await one("select confirm_manual_receipt($1,$2,$3,$4)", [org, rh, sheet, "Entrega presencial assinada"]);
  const afterDelivery = await one("select stock_quantity,reserved_quantity,blocked_quantity from inventory_stock where id=$1", [v]);
  assert.deepEqual(afterDelivery, { stock_quantity: 2, reserved_quantity: 0, blocked_quantity: 1 });
  await assert.rejects(registerReturn(sheet, [{ item_index: 0, reason_code: 12, destination: "RESTOCK" }]), /Motivo/);
  await assert.rejects(registerReturn(sheet, [{ item_index: 0, reason_code: 5, destination: "LIXO" }]), /Destino/);
  await assert.rejects(registerReturn(sheet, [{ item_index: 7, reason_code: 5, destination: "RESTOCK" }]), /inexistente/);
  await assert.rejects(registerReturn(sheet, [{ item_index: 0, reason_code: 5, destination: "RESTOCK" }, { item_index: 0, reason_code: 1, destination: "DISCARD" }]), /repetido/);
  await assert.rejects(registerReturn(sheet, [{ item_index: 0, reason_code: 5, destination: "RESTOCK" }], { note: " " }), /observações/);
  await assert.rejects(registerReturn(sheet, [{ item_index: 0, reason_code: 5, destination: "RESTOCK" }], { date: "2099-01-01" }), /Data/);
  await assert.rejects(registerReturn(sheet, [{ item_index: 0, reason_code: 5, destination: "RESTOCK" }], { actor: stock }), /negado/);
  const key = crypto.randomUUID();
  const items = [
    { item_index: 0, reason_code: 5, destination: "RESTOCK" },
    { item_index: 2, reason_code: 1, destination: "DISCARD" },
  ];
  const first = (await registerReturn(sheet, items, { key })).id;
  assert.equal((await registerReturn(sheet, items, { key })).id, first);
  await assert.rejects(registerReturn(sheet, [items[0]], { key }), /reutilizada/);
  // Volta ao estoque: +1 físico; descarte não muda saldo; bloqueado histórico intacto.
  assert.deepEqual(
    await one("select stock_quantity,reserved_quantity,blocked_quantity from inventory_stock where id=$1", [v]),
    { stock_quantity: 3, reserved_quantity: 0, blocked_quantity: 1 },
  );
  assert.deepEqual(
    (await all("select type,quantity from stock_movements where sheet_id=$1 and type='RETURN'", [sheet])).map((m) => m.quantity),
    [1],
  );
  await assert.rejects(registerReturn(sheet, [{ item_index: 2, reason_code: 13, destination: "RESTOCK" }]), /já devolvido/);
  const last = (await registerReturn(sheet, [{ item_index: 1, reason_code: 13, destination: "RESTOCK" }], { termination: true })).id;
  assert.ok(last);
  await assert.rejects(registerReturn(sheet, [{ item_index: 1, reason_code: 13, destination: "RESTOCK" }]), /já devolvido/);
  assert.equal((await one("select count(*)::int n from sheet_return_items where sheet_id=$1", [sheet])).n, 3);
  // Registro só de acréscimo; ficha original intacta.
  await assert.rejects(db.query("update sheet_returns set signature_note='x' where id=$1", [first]), /imutável/);
  await assert.rejects(db.query("delete from sheet_return_items where return_id=$1", [first]), /imutável/);
  assert.deepEqual(await one("select snapshot,snapshot_sha256,pdf_sha256 from sheets where id=$1", [sheet]), before);
  assert.equal((await one("select reservation_status from sheet_state where sheet_id=$1", [sheet])).reservation_status, "DELIVERED");
  const audit = await one("select detail from audit_events where entity_id=$1 and action='SHEET_RETURN_RECORDED' order by id desc limit 1", [sheet]);
  assert.equal(audit.detail.termination, true);
});

test("3.1 cancelamento de ficha pendente libera reserva, invalida link e audita motivo", async () => {
  const v = (await variantOf("43")).id;
  const sheet = await issueFor([{ variant_id: v }], "ELECTRONIC");
  const reserved = (await one("select reserved_quantity from inventory_stock where id=$1", [v])).reserved_quantity;
  const link = (
    await one("insert into signing_links(sheet_id,token_hash,expires_at)values($1,$2,now()+interval '1 day')returning id", [sheet, "c".repeat(64)])
  ).id;
  await assert.rejects(one("select cancel_reservation($1,$2,$3,$4)", [org, rh, sheet, "abc"]), /motivo/);
  await one("select cancel_reservation($1,$2,$3,$4)", [org, rh, sheet, "Colaborador desistiu da troca"]);
  assert.equal((await one("select reserved_quantity from inventory_stock where id=$1", [v])).reserved_quantity, reserved - 1);
  assert.ok((await one("select consumed_at from signing_links where id=$1", [link])).consumed_at);
  const audit = await one("select detail from audit_events where entity_id=$1 and action='RESERVATION_CANCELLED'", [sheet]);
  assert.equal(audit.detail.reason, "Colaborador desistiu da troca");
  await assert.rejects(registerReturn(sheet, [{ item_index: 0, reason_code: 5, destination: "RESTOCK" }]), /entregues/);
});

test("4.1 confirmação por CPF: 5 falhas contadas no Postgres bloqueiam o link; sem CPF mantém o fluxo", async () => {
  const v = (await variantOf("43")).id;
  await db.query("update employees set personal_email='pessoa@example.invalid',email_verified_at=now() where id=$1", [employee]);
  assert.equal((await one("select cpf from employees where id=$1", [employee])).cpf, "93492854010");
  const newLink = async (sheet: string) => {
    const link = (
      await one(
        "insert into signing_links(sheet_id,token_hash,expires_at,otp_hash,otp_expires_at,previewed_at)values($1,$2,now()+interval '1 day','otp',now()+interval '10 minutes',now())returning id",
        [sheet, crypto.randomUUID().replace(/-/g, "").padEnd(64, "0")],
      )
    ).id;
    await db.query(
      "update signing_links l set recipient_email=e.personal_email,recipient_verified_at=e.email_verified_at from sheets s join employees e on e.id=s.employee_id where l.id=$1 and l.sheet_id=s.id",
      [link],
    );
    return link;
  };
  const e = await one("select name from employees where id=$1", [employee]);
  const sign = (link: string) =>
    one("select complete_signature($1,'otp',null,'test',$2,'classic',$3,$4,true)", [link, e.name, "EPI-ELECTRONIC-SIMPLE-V2", "x".repeat(120)]);
  const sheet = await issueFor([{ variant_id: v }], "ELECTRONIC");
  const link = await newLink(sheet);
  await assert.rejects(sign(link), /identidade/);
  for (let i = 1; i <= 4; i++)
    assert.equal((await one("select record_identity_check($1,false)as r", [link])).r, "INVALID");
  assert.equal((await one("select record_identity_check($1,false)as r", [link])).r, "BLOCKED");
  const blocked = await one("select identity_attempts,blocked_at,consumed_at,otp_hash from signing_links where id=$1", [link]);
  assert.equal(blocked.identity_attempts, 5);
  assert.ok(blocked.blocked_at && blocked.consumed_at);
  assert.equal(blocked.otp_hash, null);
  // Mesmo um acerto depois do bloqueio não libera o link.
  assert.equal((await one("select record_identity_check($1,true)as r", [link])).r, "BLOCKED");
  await assert.rejects(sign(link), /inválido/);
  const events = (await all("select action,detail from audit_events where entity_id=$1 and action like 'SIGN%' order by id", [sheet])).map((a) => a.action);
  assert.deepEqual(events.filter((a) => a === "SIGNER_IDENTITY_FAILED").length, 5);
  assert.ok(events.includes("SIGNING_LINK_BLOCKED"));
  // Auditoria e link nunca guardam dígitos do CPF.
  const audits = JSON.stringify(await all("select detail from audit_events where entity_id=$1", [sheet]));
  assert.ok(!audits.includes("93492854010") && !/cpf/i.test(audits));
  // RH gera outro link; acerto confirma e a assinatura registra a evidência sem dígitos.
  const second = await newLink(sheet);
  assert.equal((await one("select record_identity_check($1,true)as r", [second])).r, "OK");
  await sign(second);
  const evidence = (await one("select evidence from signature_evidences where sheet_id=$1", [sheet])).evidence;
  assert.equal(evidence.authentication, "VERIFIED_EMAIL_OTP+NAME_CPF_DIGITS");
  assert.ok(!JSON.stringify(evidence).includes("93492854010"));
  // Sem CPF cadastrado: fluxo anterior, sem etapa de identidade.
  await db.query("update employees set cpf=null where id=$1", [employee]);
  const third = await issueFor([{ variant_id: v }], "ELECTRONIC");
  await sign(await newLink(third));
  assert.equal((await one("select signature_status from sheet_state where sheet_id=$1", [third])).signature_status, "SIGNED_ELECTRONIC");
  await db.query("update employees set cpf='93492854010' where id=$1", [employee]);
});

test("4.2 seed e fixtures usam somente o CPF de teste; migrations não contêm CPF", async () => {
  assert.deepEqual(
    (await all("select distinct cpf from employees where organization_id=$1 and registration like 'DEMO-%'", [org])).map((r) => r.cpf),
    ["93492854010"],
  );
  for (const name of await readdir("database/supabase/migrations"))
    assert.ok(!(await readFile(`database/supabase/migrations/${name}`, "utf8")).includes("93492854010"), name);
});
