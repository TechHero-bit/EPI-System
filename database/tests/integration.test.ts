import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { token, secretHash } from "../../backend/src/security.ts";
const db = new PGlite();
const org = "10000000-0000-4000-8000-000000000001",
  other = "20000000-0000-4000-8000-000000000001";
const admin = "30000000-0000-4000-8000-000000000001",
  rh = "30000000-0000-4000-8000-000000000002",
  stock = "30000000-0000-4000-8000-000000000003",
  outsider = "30000000-0000-4000-8000-000000000004",
  safety = "30000000-0000-4000-8000-000000000005";
// Contratos mínimos Auth/Storage para executar PostgreSQL real em WASM, sem rede.
// Isso valida SQL/PLpgSQL/RLS, não substitui integração com serviços Supabase hospedados.
const prelude = `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid()to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`;
let employee: string,
  lot: string,
  variant: string,
  lot2: string,
  variant2: string;
const one = async (sql: string, params: any[] = []) => {
  const result = (await db.query<any>(sql, params)).rows[0];
  if (sql.startsWith("insert into signing_links") && result?.id)
    await db.query(
      "update signing_links set recipient_email=e.personal_email,recipient_verified_at=e.email_verified_at from sheets s join employees e on e.id=s.employee_id where signing_links.id=$1 and signing_links.sheet_id=s.id",
      [result.id],
    );
  return result;
};
before(async () => {
  await db.exec(prelude);
  for (const name of (await readdir("database/supabase/migrations")).sort())
    await db.exec(
      await readFile(`database/supabase/migrations/${name}`, "utf8"),
    );
  await db.exec(await readFile("database/supabase/seed.sql", "utf8"));
  await db.query("insert into auth.users(id)values($1),($2),($3),($4),($5)", [
    admin,
    rh,
    stock,
    outsider,
    safety,
  ]);
  await db.query(
    "insert into public.organizations(id,name)values($1,'Outra empresa')",
    [other],
  );
  await db.query(
    "insert into public.memberships(organization_id,user_id,role)values($1,$2,'ADMIN'),($1,$3,'RH'),($1,$4,'ALMOXARIFADO'),($5,$6,'ADMIN'),($1,$7,'SEGURANCA_TRABALHO')",
    [org, admin, rh, stock, other, outsider, safety],
  );
  employee = (
    await one("select id from public.employees order by registration limit 1")
  ).id;
  const lots = (
    await db.query<any>(
      "select id,variant_id from public.lots order by batch_code",
    )
  ).rows;
  lot = lots[0].id;
  variant = lots[0].variant_id;
  lot2 = lots[1].id;
  variant2 = lots[1].variant_id;
  await db.query(
    "update public.employees set personal_email='person@example.invalid',email_verified_at=now()where id=$1",
    [employee],
  );
  await db.query("update public.lots set stock_quantity=20 where id=$1", [lot]);
});
after(async () => {
  await db.close();
});
async function issue(
  actor = admin,
  items = [{ variant_id: variant, lot_id: lot, quantity: 1 }],
  method = "ELECTRONIC",
  key = crypto.randomUUID(),
) {
  const snapshot = { requestKey: key, documentDate: "2026-10-20", items };
  return (
    await one("select public.issue_sheet($1,$2,$3,$4,$5,$6,$7,$8,$9)as id", [
      org,
      actor,
      employee,
      JSON.stringify(snapshot),
      "a".repeat(64),
      "b".repeat(64),
      `${key}.pdf`,
      method,
      JSON.stringify(items),
    ])
  ).id;
}
test("migrations criam tabelas com RLS, buckets privados e seed idempotente", async () => {
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from pg_tables where schemaname='public' and not rowsecurity",
      )
    ).n,
    0,
  );
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from storage.buckets where public",
      )
    ).n,
    0,
  );
  await db.exec(await readFile("database/supabase/seed.sql", "utf8"));
  assert.equal(
    (await one("select count(*)::integer as n from employees")).n,
    10,
  );
});
test("setup consolidado instala em banco limpo e recusa instalação duplicada", async () => {
  const clean = new PGlite();
  try {
    await clean.exec(prelude);
    const setup = await readFile("database/setup.sql", "utf8");
    await clean.exec(setup);
    assert.equal(
      (
        await clean.query<any>(
          "select count(*)::integer as n from pg_tables where schemaname='public'",
        )
      ).rows[0].n,
      (
        await one(
          "select count(*)::integer as n from pg_tables where schemaname='public'",
        )
      ).n,
    );
    await assert.rejects(clean.exec(setup), /já existe/);
    await clean.exec("rollback");
  } finally {
    await clean.close();
  }
});
test("entrada idempotente e ajuste com justificativa protegem saldo", async () => {
  const key = crypto.randomUUID();
  const params = [org, stock, lot, 2, "Entrada de teste", false, key];
  const a = await one("select operate_stock($1,$2,$3,$4,$5,$6,$7)as n", params);
  const b = await one("select operate_stock($1,$2,$3,$4,$5,$6,$7)as n", params);
  assert.equal(a.n, b.n);
  await assert.rejects(
    one("select operate_stock($1,$2,$3,$4,$5,$6,$7)", [
      org,
      rh,
      lot,
      1,
      "Entrada",
      false,
      crypto.randomUUID(),
    ]),
    /negado/,
  );
  await assert.rejects(
    one("select operate_stock($1,$2,$3,$4,$5,$6,$7)", [
      org,
      stock,
      lot,
      -999,
      "Inventário",
      true,
      crypto.randomUUID(),
    ]),
    /insuficiente/,
  );
  await assert.rejects(
    one("select operate_stock($1,$2,$3,$4,$5,$6,$7)", [
      org,
      stock,
      lot,
      3,
      "Entrada de teste",
      false,
      key,
    ]),
    /reutilizada/,
  );
});
test("quantidade 2, perfil de estoque e organização diferente não podem emitir ficha", async () => {
  await assert.rejects(
    issue(admin, [{ variant_id: variant, lot_id: lot, quantity: 2 }]),
    /sempre 1/,
  );
  await assert.rejects(issue(stock), /negado/);
  await assert.rejects(issue(outsider), /negado/);
});
test("reserva múltiplos EPIs sem baixar o saldo físico e reemissão é idempotente", async () => {
  const before = await one("select * from lots where id=$1", [lot]);
  const key = crypto.randomUUID();
  const items = [
    { variant_id: variant, lot_id: lot, quantity: 1 },
    { variant_id: variant2, lot_id: lot2, quantity: 1 },
  ];
  const id = await issue(rh, items, "MANUAL", key);
  assert.equal(await issue(rh, items, "MANUAL", key), id);
  const after = await one("select * from lots where id=$1", [lot]);
  assert.equal(after.stock_quantity, before.stock_quantity);
  assert.equal(after.reserved_quantity, before.reserved_quantity + 1);
  await assert.rejects(
    db.query("update sheets set pdf_path=$1 where id=$2", ["changed.pdf", id]),
    /imutável/,
  );
});
test("estoque disponível não pode ser excedido nem consumido por ajuste", async () => {
  const l = await one("select * from lots where id=$1", [lot]);
  await assert.rejects(
    issue(
      admin,
      Array.from({ length: 15 }, () => ({
        variant_id: variant2,
        lot_id: lot2,
        quantity: 1,
      })),
    ),
    /estoque válido/,
  );
  await assert.rejects(
    one("select operate_stock($1,$2,$3,$4,$5,$6,$7)", [
      org,
      stock,
      lot,
      -l.stock_quantity,
      "Inventário justificado",
      true,
      crypto.randomUUID(),
    ]),
    /insuficiente/,
  );
});
test("cancelamento libera reserva uma vez e preserva estoque físico", async () => {
  const id = await issue();
  const before = await one("select * from lots where id=$1", [lot]);
  await one("select cancel_reservation($1,$2,$3,$4)", [
    org,
    rh,
    id,
    "Cancelamento de teste",
  ]);
  await one("select cancel_reservation($1,$2,$3,$4)", [
    org,
    rh,
    id,
    "Repetição de teste",
  ]);
  const after = await one("select * from lots where id=$1", [lot]);
  assert.equal(after.stock_quantity, before.stock_quantity);
  assert.equal(after.reserved_quantity, before.reserved_quantity - 1);
  await assert.rejects(
    one("select confirm_receipt($1,$2,$3,$4,$5)", [
      org,
      rh,
      id,
      "IN_PERSON",
      "Entrega",
    ]),
    /cancelada/,
  );
});
test("link com hash, OTP, expiração e uso único mantém entrega física pendente", async () => {
  const id = await issue(safety);
  const raw = token(),
    pepper = "x".repeat(32);
  const hash = secretHash(raw, pepper);
  const code = secretHash("123456", pepper);
  const link = (
    await one(
      "insert into signing_links(sheet_id,token_hash,expires_at,otp_hash,otp_expires_at,previewed_at)values($1,$2,now()+interval '1 hour',$3,now()+interval '10 minutes',now())returning id",
      [id, hash, code],
    )
  ).id;
  assert.notEqual(hash, raw);
  assert.equal(
    (await one("select verify_signing_code($1,$2)as ok", [link, "bad"])).ok,
    false,
  );
  assert.equal(
    (await one("select verify_signing_code($1,$2)as ok", [link, code])).ok,
    true,
  );
  const before = await one("select * from lots where id=$1", [lot]);
  await one("select complete_signature($1,$2,$3,$4)", [
    link,
    code,
    "127.0.0.1",
    "test",
  ]);
  const state = await one("select * from sheet_state where sheet_id=$1", [id]);
  assert.equal(state.signature_status, "SIGNED_ELECTRONIC");
  assert.equal(state.receipt_status, "UNCONFIRMED");
  assert.equal(
    (await one("select stock_quantity from lots where id=$1", [lot]))
      .stock_quantity,
    before.stock_quantity,
  );
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from signature_evidences where sheet_id=$1",
        [id],
      )
    ).n,
    1,
  );
  await assert.rejects(
    one("select complete_signature($1,$2,$3,$4)", [link, code, null, "test"]),
    /inválido ou expirado/,
  );
});
test("token expirado e cinco tentativas inválidas bloqueiam assinatura", async () => {
  const id = await issue();
  const link = (
    await one(
      "insert into signing_links(sheet_id,token_hash,expires_at,otp_hash,otp_expires_at)values($1,$2,now()+interval '1 hour','good',now()+interval '10 minutes')returning id",
      [id, crypto.randomUUID()],
    )
  ).id;
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await one("select verify_signing_code($1,$2)as ok", [link, "bad"])).ok,
      false,
    );
  assert.equal(
    (await one("select verify_signing_code($1,$2)as ok", [link, "good"])).ok,
    false,
  );
  await db.query(
    "update signing_links set expires_at=now()-interval '1 minute' where id=$1",
    [link],
  );
  await assert.rejects(
    one("select complete_signature($1,$2,$3,$4)", [link, "good", null, "test"]),
    /expirado/,
  );
});
test("registro presencial exige perfil RH; entrega baixa uma unidade uma vez", async () => {
  const id = await issue(admin, undefined, "MANUAL");
  await assert.rejects(
    one("select record_manual_signature($1,$2,$3,$4)", [
      org,
      stock,
      id,
      "Arquivo físico",
    ]),
    /negado/,
  );
  await one("select record_manual_signature($1,$2,$3,$4)", [
    org,
    rh,
    id,
    "Arquivo físico",
  ]);
  const before = await one("select stock_quantity from lots where id=$1", [
    lot,
  ]);
  await one("select confirm_receipt($1,$2,$3,$4,$5)", [
    org,
    stock,
    id,
    "IN_PERSON",
    "Entrega presencial",
  ]);
  await one("select confirm_receipt($1,$2,$3,$4,$5)", [
    org,
    stock,
    id,
    "IN_PERSON",
    "Repetição",
  ]);
  assert.equal(
    (await one("select stock_quantity from lots where id=$1", [lot]))
      .stock_quantity,
    before.stock_quantity - 1,
  );
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from stock_movements where sheet_id=$1 and type='ISSUE'",
        [id],
      )
    ).n,
    1,
  );
  assert.ok(
    (
      await one(
        "select count(*)::integer as n from audit_events where entity_id=$1",
        [id],
      )
    ).n >= 3,
  );
});
test("RLS bloqueia outras organizações, dados pessoais e alterações de perfil", async () => {
  await db.exec("set role authenticated");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      outsider,
    ]);
    assert.equal(
      (await one("select count(*)::integer as n from employees")).n,
      0,
    );
    assert.equal((await one("select count(*)::integer as n from sheets")).n, 0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      stock,
    ]);
    assert.equal(
      (await one("select count(*)::integer as n from employees")).n,
      0,
    );
    assert.equal((await one("select count(*)::integer as n from sheets")).n, 0);
    await assert.rejects(
      db.query("update memberships set role='ADMIN'where user_id=$1", [stock]),
      /permission denied/,
    );
    await assert.rejects(
      one("select operate_stock($1,$2,$3,$4,$5,$6,$7)", [
        org,
        stock,
        lot,
        1,
        "Teste",
        false,
        crypto.randomUUID(),
      ]),
      /permission denied/,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [rh]);
    assert.equal(
      (await one("select count(*)::integer as n from employees")).n,
      10,
    );
  } finally {
    await db.exec("reset role");
  }
});
test("limite de requisições é persistido e administrador não altera próprio perfil", async () => {
  assert.equal(
    (await one("select consume_request_limit('unit-test',1,60)as ok")).ok,
    true,
  );
  assert.equal(
    (await one("select consume_request_limit('unit-test',1,60)as ok")).ok,
    false,
  );
  await assert.rejects(
    one("select change_member_role($1,$2,$3,$4)", [org, admin, admin, "RH"]),
    /próprio/,
  );
  await one("select change_member_role($1,$2,$3,$4)", [
    org,
    admin,
    stock,
    "ALMOXARIFADO",
  ]);
});
