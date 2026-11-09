import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  SIGNATURE_TERMS,
  SIGNATURE_TERMS_VERSION,
} from "../../contracts/signature.mjs";
import {
  token,
  secretHash,
} from "../../Backend/src/services/security.service.ts";
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
      "select id,id as variant_id from public.inventory_stock order by id",
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
  await db.query(
    "update public.inventory_stock set stock_quantity=20 where id=$1",
    [lot],
  );
});
after(async () => {
  await db.close();
});
test("arquivos de migrations são numerados a partir de 001 sem lacunas", async () => {
  const files = (await readdir("database/supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.deepEqual(files, [
    "001_init.sql",
    "002_audit_email_verification.sql",
    "003_manual_signature.sql",
    "004_reservations_and_access.sql",
    "005_signing_identity.sql",
    "006_inventory_without_lots.sql",
    "007_manual_receipt.sql",
    "008_typed_signature.sql",
    "009_standard_equipment_sizes.sql",
    "010_catalog_ca_inventory.sql",
    "011_managed_lists_kits.sql",
    "012_sheet_returns.sql",
    "013_signer_identity_check.sql",
  ]);
  for (const [index, file] of files.entries()) {
    const source = await readFile(
      `database/supabase/migrations/${file}`,
      "utf8",
    );
    assert.ok(
      source.startsWith(`-- MIGRATION ${String(index + 1).padStart(3, "0")} -`),
    );
  }
});
test("duas fichas do mesmo colaborador usam sua matrícula, preservando zeros", async () => {
  await db.query("update employees set registration='000546' where id=$1", [
    employee,
  ]);
  const a = await issue(),
    b = await issue();
  assert.notEqual(a, b);
  for (const id of [a, b]) {
    const row = await one(
      "select employee_registration,snapshot from sheets where id=$1",
      [id],
    );
    assert.equal(row.employee_registration, "000546");
    assert.equal(row.snapshot.recordNumber, "000546");
    await one("select cancel_reservation($1,$2,$3,$4)", [
      org,
      admin,
      id,
      "Fim do teste",
    ]);
  }
});
test("atualização preserva snapshot e hash das fichas já emitidas", async () => {
  const existing = new PGlite();
  try {
    await existing.exec(prelude);
    const files = (await readdir("database/supabase/migrations")).sort();
    for (const file of files.filter(
      (f) => f < "006_inventory_without_lots.sql",
    ))
      await existing.exec(
        await readFile(`database/supabase/migrations/${file}`, "utf8"),
      );
    await existing.exec(
      await readFile("database/tests/fixtures/legacy-seed.sql", "utf8"),
    );
    await existing.query("insert into auth.users(id)values($1)", [admin]);
    await existing.query(
      "insert into memberships(organization_id,user_id,role)values($1,$2,'ADMIN')",
      [org, admin],
    );
    const person = (
      await existing.query<any>("select id from employees limit 1")
    ).rows[0].id;
    const batch = (
      await existing.query<any>("select id,variant_id from lots limit 1")
    ).rows[0];
    await existing.query(
      "update lots set stock_quantity=10,expires_at=null where id=$1",
      [batch.id],
    );
    await existing.query(
      "insert into lots(variant_id,batch_code,stock_quantity,condition)values($1,'AVARIADO-LEGADO',4,'AVARIADO')",
      [batch.variant_id],
    );
    const key = crypto.randomUUID(),
      items = [{ variant_id: batch.variant_id, lot_id: batch.id, quantity: 1 }],
      snapshot = { requestKey: key, documentDate: "2026-10-21", items };
    const id = (
      await existing.query<any>(
        "select issue_sheet($1,$2,$3,$4,$5,$6,$7,$8,$9)as id",
        [
          org,
          admin,
          person,
          JSON.stringify(snapshot),
          "a".repeat(64),
          "b".repeat(64),
          `${key}.pdf`,
          "MANUAL",
          JSON.stringify(items),
        ],
      )
    ).rows[0].id;
    await existing.exec(
      await readFile(
        "database/supabase/migrations/006_inventory_without_lots.sql",
        "utf8",
      ),
    );
    const consolidated = (
      await existing.query<any>(
        "select stock_quantity,reserved_quantity,blocked_quantity from inventory_stock where id=$1",
        [batch.variant_id],
      )
    ).rows[0];
    assert.equal(consolidated.stock_quantity, 14);
    assert.equal(consolidated.reserved_quantity, 1);
    assert.equal(consolidated.blocked_quantity, 4);
    await existing.query("select confirm_receipt($1,$2,$3,$4,$5)", [
      org,
      admin,
      id,
      "IN_PERSON",
      "Entrega após migração",
    ]);
    assert.equal(
      (
        await existing.query<any>(
          "select stock_quantity from inventory_stock where id=$1",
          [batch.variant_id],
        )
      ).rows[0].stock_quantity,
      13,
    );
    const saved = (
      await existing.query<any>(
        "select snapshot,pdf_sha256,employee_registration from sheets where id=$1",
        [id],
      )
    ).rows[0];
    assert.deepEqual(saved.snapshot, snapshot);
    assert.equal(saved.pdf_sha256, "b".repeat(64));
    assert.equal(saved.employee_registration, null);
    await assert.rejects(
      existing.query(
        "update sheets set employee_registration='ALTERADA' where id=$1",
        [id],
      ),
    );
  } finally {
    await existing.close();
  }
});
test("banco recusa número de registro forjado e não permite reescrever ficha", async () => {
  const key = crypto.randomUUID();
  const n = (
    await one("select registration from employees where id=$1", [employee])
  ).registration;
  await assert.rejects(
    one("select public.issue_sheet($1,$2,$3,$4,$5,$6,$7,$8,$9)as id", [
      org,
      admin,
      employee,
      JSON.stringify({
        requestKey: key,
        recordNumber: "FORJADO",
        employee: { registration: n },
        items: [],
        documentDate: "2026-10-25",
      }),
      "a".repeat(64),
      "b".repeat(64),
      `${key}.pdf`,
      "MANUAL",
      JSON.stringify([{ variant_id: variant, quantity: 1 }]),
    ]),
    /registro deve ser a matrícula/,
  );
  const id = await issue(admin, undefined, "MANUAL", key);
  const saved = await one(
    "select employee_registration,snapshot from public.sheets where id=$1",
    [id],
  );
  assert.equal(saved.employee_registration, n);
  assert.equal(saved.snapshot.recordNumber, n);
  await assert.rejects(
    one(
      "update public.sheets set employee_registration='FORJADA' where id=$1 returning id",
      [id],
    ),
  );
  await one("select public.cancel_reservation($1,$2,$3,$4)", [
    org,
    admin,
    id,
    "Teste de numeração",
  ]);
});
async function issue(
  actor = admin,
  items = [{ variant_id: variant, quantity: 1 }],
  method = "ELECTRONIC",
  key = crypto.randomUUID(),
) {
  const recordNumber = (
    await one("select registration from employees where id=$1", [employee])
  ).registration;
  const snapshot = {
    requestKey: key,
    recordNumber,
    employee: {
      registration: recordNumber,
      name: (await one("select name from employees where id=$1", [employee]))
        .name,
    },
    documentDate: "2026-10-20",
    items,
  };
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
test("matrículas duplicadas e vazias são recusadas no banco", async () => {
  const enrollment = (
    await one("select registration from employees where id=$1", [employee])
  ).registration;
  for (const registration of [enrollment, "   "])
    await assert.rejects(
      one(
        "insert into employees(organization_id,name,registration,department,job_title,admission_date)values($1,'Teste',$2,'RH','Técnico',current_date)returning id",
        [org, registration],
      ),
    );
});
test("lotes antigos não recebem operações e o contador por ficha não existe", async () => {
  const removed = await one(
    "select to_regclass('public.sheet_number_counters')as counter,to_regclass('public.sheet_number_allocations')as allocations,to_regprocedure('public.reserve_sheet_number(uuid,uuid,uuid)')as reserve",
  );
  assert.deepEqual(removed, {
    counter: null,
    allocations: null,
    reserve: null,
  });
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from information_schema.columns where table_schema='public' and table_name='sheets' and column_name='record_number'",
      )
    ).n,
    0,
  );
  await assert.rejects(
    one(
      "insert into lots(variant_id,batch_code,stock_quantity)values($1,'NOVO-LOTE',1)returning id",
      [variant],
    ),
    /Lotes foram desativados/,
  );
  await db.exec("set role service_role");
  try {
    await assert.rejects(
      one("select operate_stock($1,$2,$3,$4,$5,$6,$7)", [
        org,
        stock,
        variant,
        1,
        "Não deve ocorrer",
        false,
        crypto.randomUUID(),
      ]),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
  }
});
test("unidades bloqueadas não podem ser reservadas nem consumidas por ajuste", async () => {
  const row = await one(
    "select * from inventory_stock order by id offset 2 limit 1",
  );
  await db.query(
    "update inventory_stock set stock_quantity=5,reserved_quantity=0,blocked_quantity=5 where id=$1",
    [row.id],
  );
  try {
    await assert.rejects(
      issue(admin, [{ variant_id: row.id, quantity: 1 }]),
      /Sem estoque válido/,
    );
    await assert.rejects(
      one("select operate_inventory($1,$2,$3,$4,$5,$6,$7)", [
        org,
        stock,
        row.id,
        -1,
        "Inventário de teste",
        true,
        crypto.randomUUID(),
      ]),
      /insuficiente/,
    );
  } finally {
    await db.query(
      "update inventory_stock set stock_quantity=$2,reserved_quantity=$3,blocked_quantity=$4 where id=$1",
      [row.id, row.stock_quantity, row.reserved_quantity, row.blocked_quantity],
    );
  }
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
  const a = await one(
    "select operate_inventory($1,$2,$3,$4,$5,$6,$7)as n",
    params,
  );
  const b = await one(
    "select operate_inventory($1,$2,$3,$4,$5,$6,$7)as n",
    params,
  );
  assert.equal(a.n, b.n);
  await assert.rejects(
    one("select operate_inventory($1,$2,$3,$4,$5,$6,$7)", [
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
    one("select operate_inventory($1,$2,$3,$4,$5,$6,$7)", [
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
    one("select operate_inventory($1,$2,$3,$4,$5,$6,$7)", [
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
    issue(admin, [{ variant_id: variant, quantity: 2 }]),
    /sempre 1/,
  );
  await assert.rejects(issue(stock), /negado/);
  await assert.rejects(issue(outsider), /negado/);
});
test("reserva múltiplos EPIs sem baixar o saldo físico e reemissão é idempotente", async () => {
  const before = await one("select * from inventory_stock where id=$1", [lot]);
  const key = crypto.randomUUID();
  const items = [
    { variant_id: variant, quantity: 1 },
    { variant_id: variant2, quantity: 1 },
  ];
  const id = await issue(rh, items, "MANUAL", key);
  assert.equal(await issue(rh, items, "MANUAL", key), id);
  const after = await one("select * from inventory_stock where id=$1", [lot]);
  assert.equal(after.stock_quantity, before.stock_quantity);
  assert.equal(after.reserved_quantity, before.reserved_quantity + 1);
  await assert.rejects(
    db.query("update sheets set pdf_path=$1 where id=$2", ["changed.pdf", id]),
    /imutável/,
  );
});
test("estoque disponível não pode ser excedido nem consumido por ajuste", async () => {
  const l = await one("select * from inventory_stock where id=$1", [lot]);
  await assert.rejects(
    issue(
      admin,
      Array.from({ length: 15 }, () => ({
        variant_id: variant2,
        quantity: 1,
      })),
    ),
    /estoque válido/,
  );
  await assert.rejects(
    one("select operate_inventory($1,$2,$3,$4,$5,$6,$7)", [
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
  const before = await one("select * from inventory_stock where id=$1", [lot]);
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
  const after = await one("select * from inventory_stock where id=$1", [lot]);
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
  const before = await one("select * from inventory_stock where id=$1", [lot]);
  const signerName = (
    await one("select snapshot from sheets where id=$1", [id])
  ).snapshot.employee.name;
  const consent = [
    signerName,
    "classic",
    SIGNATURE_TERMS_VERSION,
    SIGNATURE_TERMS,
  ];
  // Seed employees carry the fictitious test CPF: the link needs the API's identity check.
  await assert.rejects(
    one("select complete_signature($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      link,
      code,
      null,
      "test",
      ...consent,
      true,
    ]),
    /identidade/,
  );
  assert.equal(
    (await one("select record_identity_check($1,true)as r", [link])).r,
    "OK",
  );
  await assert.rejects(
    one("select complete_signature($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      link,
      code,
      null,
      "test",
      ...consent,
      false,
    ]),
    /Aceite/,
  );
  await assert.rejects(
    one("select complete_signature($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      link,
      code,
      null,
      "test",
      "Outra pessoa",
      "classic",
      SIGNATURE_TERMS_VERSION,
      SIGNATURE_TERMS,
      true,
    ]),
    /titular/,
  );
  await one("select complete_signature($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
    link,
    code,
    "127.0.0.1",
    "test",
    ...consent,
    true,
  ]);
  const state = await one("select * from sheet_state where sheet_id=$1", [id]);
  assert.equal(state.signature_status, "SIGNED_ELECTRONIC");
  assert.equal(state.receipt_status, "UNCONFIRMED");
  const evidence = (
    await one("select evidence from signature_evidences where sheet_id=$1", [
      id,
    ])
  ).evidence;
  assert.equal(evidence.signerName, signerName);
  assert.equal(evidence.signatureStyle, "classic");
  assert.equal(evidence.termsVersion, SIGNATURE_TERMS_VERSION);
  assert.equal(evidence.termsText, SIGNATURE_TERMS);
  assert.equal(evidence.acceptedTerms, true);
  assert.equal(
    (await one("select stock_quantity from inventory_stock where id=$1", [lot]))
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
    one("select complete_signature($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      link,
      code,
      null,
      "test",
      ...consent,
      true,
    ]),
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
    one("select complete_signature($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      link,
      "good",
      null,
      "test",
      "Titular",
      "classic",
      SIGNATURE_TERMS_VERSION,
      SIGNATURE_TERMS,
      true,
    ]),
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
  const before = await one(
    "select stock_quantity from inventory_stock where id=$1",
    [lot],
  );
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
    (await one("select stock_quantity from inventory_stock where id=$1", [lot]))
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
test("entrega presencial confirma assinatura atomicamente e aceita repetição", async () => {
  const id = await issue(rh, undefined, "MANUAL");
  const note = "Colaborador recebeu os EPIs e já assinou presencialmente.";
  const before = await one("select * from inventory_stock where id=$1", [lot]);
  await assert.rejects(
    one("select confirm_manual_receipt($1,$2,$3,$4)", [
      other,
      outsider,
      id,
      note,
    ]),
    /não encontrada/,
  );
  await assert.rejects(
    one("select confirm_manual_receipt($1,$2,$3,$4)", [org, stock, id, note]),
    /negado/,
  );
  await assert.rejects(
    one("select confirm_manual_receipt($1,$2,$3,$4)", [org, rh, id, " "]),
    /observações/,
  );
  // A failure after recording the signature must roll back the entire operation.
  await db.query("update inventory_stock set reserved_quantity=0 where id=$1", [
    lot,
  ]);
  await assert.rejects(
    one("select confirm_manual_receipt($1,$2,$3,$4)", [org, rh, id, note]),
    /inconsistente/,
  );
  const pending = await one("select * from sheet_state where sheet_id=$1", [
    id,
  ]);
  assert.equal(pending.signature_status, "PENDING");
  assert.equal(pending.receipt_status, "UNCONFIRMED");
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from signatures where sheet_id=$1",
        [id],
      )
    ).n,
    0,
  );
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from stock_movements where sheet_id=$1",
        [id],
      )
    ).n,
    0,
  );
  await db.query(
    "update inventory_stock set reserved_quantity=$2 where id=$1",
    [lot, before.reserved_quantity],
  );
  await one("select confirm_manual_receipt($1,$2,$3,$4)", [org, rh, id, note]);
  await one("select confirm_manual_receipt($1,$2,$3,$4)", [org, rh, id, note]);
  const state = await one("select * from sheet_state where sheet_id=$1", [id]);
  assert.equal(state.signature_status, "SIGNED_MANUAL");
  assert.equal(state.receipt_status, "CONFIRMED");
  assert.equal(state.reservation_status, "DELIVERED");
  const balance = await one("select * from inventory_stock where id=$1", [lot]);
  assert.equal(balance.stock_quantity, before.stock_quantity - 1);
  assert.equal(balance.reserved_quantity, before.reserved_quantity - 1);
  for (const table of ["signatures", "receipts", "stock_movements"])
    assert.equal(
      (
        await one(
          `select count(*)::integer as n from ${table} where sheet_id=$1`,
          [id],
        )
      ).n,
      1,
    );
  const signature = await one("select * from signatures where sheet_id=$1", [
    id,
  ]);
  assert.equal(signature.note, note);
  assert.equal(signature.actor_id, rh);
  assert.equal(
    signature.document_sha256,
    (await one("select pdf_sha256 from sheets where id=$1", [id])).pdf_sha256,
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
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from audit_events where entity_id=$1 and action='MANUAL_SIGNATURE_RECORDED'",
        [id],
      )
    ).n,
    1,
  );
});

test("confirmação conjunta não assina fichas eletrônicas nem reservas canceladas", async () => {
  const electronic = await issue();
  await assert.rejects(
    one("select confirm_manual_receipt($1,$2,$3,$4)", [
      org,
      rh,
      electronic,
      "Recebido e assinado",
    ]),
    /eletrônica/,
  );
  assert.equal(
    (
      await one("select signature_status from sheet_state where sheet_id=$1", [
        electronic,
      ])
    ).signature_status,
    "PENDING",
  );
  const manual = await issue(rh, undefined, "MANUAL");
  await one("select cancel_reservation($1,$2,$3,$4)", [
    org,
    rh,
    manual,
    "Cancelamento de teste",
  ]);
  await assert.rejects(
    one("select confirm_manual_receipt($1,$2,$3,$4)", [
      org,
      rh,
      manual,
      "Recebido e assinado",
    ]),
    /cancelada/,
  );
  assert.equal(
    (
      await one(
        "select count(*)::integer as n from signatures where sheet_id=$1",
        [manual],
      )
    ).n,
    0,
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
    assert.equal(
      (await one("select count(*)::integer as n from inventory_stock")).n,
      0,
    );
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
      one("select operate_inventory($1,$2,$3,$4,$5,$6,$7)", [
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
