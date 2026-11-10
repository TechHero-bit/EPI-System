-- GERADO: npm run db:setup. Apenas projeto Supabase NOVO.
-- Não combinar com a execução das migrations no mesmo banco.
begin;
do $$begin if to_regclass('public.organizations') is not null then raise exception 'Estrutura EPI já existe. Use somente as migrations pendentes.';end if;end $$;

-- MIGRATION: 001_init.sql
-- MIGRATION 001 - Estrutura inicial do ERP, integridade, permissões e RLS.
-- Aplicar antes de 002_audit_email_verification.sql.
-- Execute somente em projeto Supabase de desenvolvimento. Produção exige revisão e backup.
-- gen_random_uuid() é nativo no PostgreSQL 13+; não requer extensão.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  created_at timestamptz not null default now()
);
create table public.memberships (
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('ADMIN','ALMOXARIFADO','RH','SEGURANCA')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) between 2 and 160),
  registration text not null,
  department text not null default '',
  job_title text not null,
  admission_date date not null,
  termination_date date,
  personal_email text,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, registration),
  check (termination_date is null or termination_date >= admission_date)
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  category text not null,
  description text not null,
  ca text,
  brand text not null default '',
  model text not null default '',
  risk_code text not null default '',
  ca_expires_at date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  size text not null default 'Único',
  sku text not null unique,
  minimum_stock integer not null default 0 check (minimum_stock >= 0)
);
create table public.lots (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.variants(id),
  batch_code text not null,
  supplier text not null default '',
  received_at date not null default current_date,
  expires_at date,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  unique (variant_id, batch_code)
);
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  lot_id uuid not null references public.lots(id),
  type text not null check (type in ('RECEIPT','ISSUE','ADJUSTMENT')),
  quantity integer not null check (quantity <> 0),
  sheet_id uuid,
  actor_id uuid references auth.users(id),
  reason text not null default '',
  created_at timestamptz not null default now(),
  check (type <> 'ISSUE' or quantity = -1)
);
create table public.sheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  employee_id uuid not null references public.employees(id),
  version integer not null,
  snapshot jsonb not null,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  pdf_sha256 text not null check (pdf_sha256 ~ '^[a-f0-9]{64}$'),
  pdf_path text not null unique,
  issued_by uuid not null references auth.users(id),
  issued_at timestamptz not null default now(),
  signature_method text not null check (signature_method in ('MANUAL','ELECTRONIC')),
  unique (employee_id, version)
);
alter table public.stock_movements add constraint stock_movements_sheet_fk foreign key (sheet_id) references public.sheets(id);
create table public.sheet_items (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.sheets(id),
  variant_id uuid not null references public.variants(id),
  lot_id uuid not null references public.lots(id),
  risk_code text not null default '',
  quantity integer not null default 1 check (quantity = 1)
);
create table public.sheet_state (
  sheet_id uuid primary key references public.sheets(id),
  signature_status text not null default 'PENDING' check (signature_status in ('PENDING','SIGNED_ELECTRONIC','SIGNED_MANUAL')),
  receipt_status text not null default 'UNCONFIRMED' check (receipt_status in ('UNCONFIRMED','CONFIRMED')),
  updated_at timestamptz not null default now()
);
create table public.signing_links (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.sheets(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  otp_hash text,
  otp_expires_at timestamptz,
  otp_sent_at timestamptz,
  otp_send_count integer not null default 0 check (otp_send_count between 0 and 3),
  previewed_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 5),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.email_verifications (
  employee_id uuid primary key references public.employees(id),
  email_address text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5)
);
create table public.signatures (
  sheet_id uuid primary key references public.sheets(id),
  link_id uuid unique references public.signing_links(id),
  method text not null check (method in ('ELECTRONIC_SIMPLE','MANUAL_RECORDED')),
  accepted_terms boolean not null,
  document_sha256 text not null,
  signed_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  actor_id uuid references auth.users(id),
  note text
);
create table public.receipts (
  sheet_id uuid primary key references public.sheets(id),
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id),
  method text not null check (method in ('IN_PERSON','EMPLOYEE_DECLARATION')),
  note text not null default ''
);
create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  actor_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index on public.employees(organization_id, name);
create index on public.products(organization_id, category);
create index on public.sheets(organization_id, issued_at desc);
create index on public.signing_links(sheet_id, expires_at desc);
create index on public.stock_movements(organization_id, created_at desc);
create index on public.audit_events(organization_id, created_at desc);

-- Imutabilidade do conteúdo emitido; estado e evidências ficam em tabelas separadas.
create function public.reject_sheet_change() returns trigger language plpgsql as $$
begin raise exception 'Ficha emitida é imutável'; end $$;
create trigger sheets_immutable before update or delete on public.sheets for each row execute function public.reject_sheet_change();
create trigger sheet_items_immutable before update or delete on public.sheet_items for each row execute function public.reject_sheet_change();

create function public.is_member(p_org uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where organization_id = p_org and user_id = (select auth.uid()))
$$;
revoke all on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
create function public.has_role(p_org uuid, p_roles text[]) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where organization_id=p_org and user_id=(select auth.uid()) and role=any(p_roles))
$$;
revoke all on function public.has_role(uuid,text[]) from public, anon;
grant execute on function public.has_role(uuid,text[]) to authenticated;

do $$ declare t text; begin
  foreach t in array array['organizations','memberships','employees','products','variants','lots','stock_movements','sheets','sheet_items','sheet_state','signing_links','email_verifications','signatures','receipts','audit_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
grant select on public.organizations, public.memberships, public.employees, public.products, public.variants, public.lots, public.stock_movements, public.sheets, public.sheet_items, public.sheet_state, public.signatures, public.receipts, public.audit_events to authenticated;
create policy organizations_read on public.organizations for select to authenticated using (public.is_member(id));
create policy memberships_read on public.memberships for select to authenticated using (public.is_member(organization_id));
create policy employees_read on public.employees for select to authenticated using (public.has_role(organization_id,array['ADMIN','RH','SEGURANCA']));
create policy products_read on public.products for select to authenticated using (public.is_member(organization_id));
create policy variants_read on public.variants for select to authenticated using (exists (select 1 from public.products p where p.id = product_id and public.is_member(p.organization_id)));
create policy lots_read on public.lots for select to authenticated using (exists (select 1 from public.variants v join public.products p on p.id = v.product_id where v.id = variant_id and public.is_member(p.organization_id)));
create policy movements_read on public.stock_movements for select to authenticated using (public.is_member(organization_id));
create policy sheets_read on public.sheets for select to authenticated using (public.is_member(organization_id));
create policy items_read on public.sheet_items for select to authenticated using (exists (select 1 from public.sheets s where s.id = sheet_id and public.is_member(s.organization_id)));
create policy state_read on public.sheet_state for select to authenticated using (exists (select 1 from public.sheets s where s.id = sheet_id and public.is_member(s.organization_id)));
create policy signatures_read on public.signatures for select to authenticated using (exists (select 1 from public.sheets s where s.id = sheet_id and public.has_role(s.organization_id,array['ADMIN','RH','SEGURANCA'])));
create policy receipts_read on public.receipts for select to authenticated using (exists (select 1 from public.sheets s where s.id = sheet_id and public.is_member(s.organization_id)));
create policy audit_read on public.audit_events for select to authenticated using (public.is_member(organization_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('epi-sheets', 'epi-sheets', false, 10485760, array['application/pdf']) on conflict (id) do nothing;
-- Nenhuma policy em storage.objects: somente backend com service_role pode acessar.

create function public.receive_stock(p_org uuid, p_actor uuid, p_lot uuid, p_quantity integer, p_reason text default '')
returns integer language plpgsql security definer set search_path = '' as $$
declare v_stock integer;
begin
  if p_quantity <= 0 or p_quantity > 100000 then raise exception 'Quantidade inválida'; end if;
  if not exists (select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in ('ADMIN','ALMOXARIFADO')) then raise exception 'Acesso negado'; end if;
  update public.lots l set stock_quantity = stock_quantity + p_quantity
    from public.variants v join public.products p on p.id=v.product_id
    where l.id=p_lot and l.variant_id=v.id and p.organization_id=p_org
    returning l.stock_quantity into v_stock;
  if v_stock is null then raise exception 'Lote não encontrado'; end if;
  insert into public.stock_movements(organization_id,lot_id,type,quantity,actor_id,reason)
    values(p_org,p_lot,'RECEIPT',p_quantity,p_actor,coalesce(p_reason,''));
  insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)
    values(p_org,p_actor,'STOCK_RECEIVED','lot',p_lot,jsonb_build_object('quantity',p_quantity));
  return v_stock;
end $$;

create function public.issue_sheet(p_org uuid, p_actor uuid, p_employee uuid, p_snapshot jsonb, p_snapshot_hash text, p_pdf_hash text, p_pdf_path text, p_method text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_sheet uuid; v_version integer; i record; v_stock integer;
begin
  if not exists (select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in ('ADMIN','RH','SEGURANCA')) then raise exception 'Acesso negado'; end if;
  if not exists (select 1 from public.employees where id=p_employee and organization_id=p_org) then raise exception 'Colaborador não encontrado'; end if;
  if p_method not in ('MANUAL','ELECTRONIC') then raise exception 'Método inválido'; end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then raise exception 'Itens inválidos'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_employee::text, 0));
  select coalesce(max(version),0)+1 into v_version from public.sheets where employee_id=p_employee;
  insert into public.sheets(organization_id,employee_id,version,snapshot,snapshot_sha256,pdf_sha256,pdf_path,issued_by,signature_method)
    values(p_org,p_employee,v_version,p_snapshot,p_snapshot_hash,p_pdf_hash,p_pdf_path,p_actor,p_method) returning id into v_sheet;
  for i in select * from jsonb_to_recordset(p_items) as x(variant_id uuid,lot_id uuid,risk text,quantity integer) order by lot_id loop
    if i.quantity is distinct from 1 then raise exception 'Quantidade deve ser sempre 1'; end if;
    update public.lots l set stock_quantity=stock_quantity-1
      from public.variants v join public.products p on p.id=v.product_id
      where l.id=i.lot_id and l.variant_id=i.variant_id and v.id=i.variant_id and p.organization_id=p_org
        and l.stock_quantity >= 1 and (l.expires_at is null or l.expires_at >= current_date)
        and (p.ca_expires_at is null or p.ca_expires_at >= current_date) and p.active
      returning l.stock_quantity into v_stock;
    if not found then raise exception 'Sem estoque válido para o lote %', i.lot_id; end if;
    insert into public.sheet_items(sheet_id,variant_id,lot_id,risk_code,quantity) values(v_sheet,i.variant_id,i.lot_id,coalesce(i.risk,''),1);
    insert into public.stock_movements(organization_id,lot_id,type,quantity,sheet_id,actor_id) values(p_org,i.lot_id,'ISSUE',-1,v_sheet,p_actor);
  end loop;
  insert into public.sheet_state(sheet_id) values(v_sheet);
  insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)
    values(p_org,p_actor,'SHEET_ISSUED','sheet',v_sheet,jsonb_build_object('version',v_version,'method',p_method));
  return v_sheet;
end $$;

create function public.complete_signature(p_link uuid, p_otp_hash text, p_ip inet, p_agent text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.signing_links%rowtype; s public.sheets%rowtype; v_employee public.employees%rowtype;
begin
  select * into l from public.signing_links where id=p_link for update;
  if not found or l.consumed_at is not null or l.expires_at <= now() then raise exception 'Link inválido ou expirado'; end if;
  if l.attempts >= 5 or l.otp_hash is null or l.otp_expires_at <= now() or l.otp_hash <> p_otp_hash or l.previewed_at is null then
    raise exception 'Código inválido ou expirado';
  end if;
  select * into s from public.sheets where id=l.sheet_id;
  select * into v_employee from public.employees where id=s.employee_id;
  if v_employee.email_verified_at is null or s.signature_method <> 'ELECTRONIC' then raise exception 'Assinatura eletrônica indisponível'; end if;
  if exists (select 1 from public.signatures where sheet_id=s.id) then raise exception 'Ficha já assinada'; end if;
  insert into public.signatures(sheet_id,link_id,method,accepted_terms,document_sha256,ip_address,user_agent)
    values(s.id,l.id,'ELECTRONIC_SIMPLE',true,s.pdf_sha256,p_ip,left(p_agent,500));
  update public.signing_links set consumed_at=now(),otp_hash=null where id=l.id;
  update public.signing_links set consumed_at=now(),otp_hash=null where sheet_id=s.id and id<>l.id and consumed_at is null;
  update public.sheet_state set signature_status='SIGNED_ELECTRONIC',updated_at=now() where sheet_id=s.id;
  insert into public.audit_events(organization_id,action,entity,entity_id,detail)
    values(s.organization_id,'SHEET_SIGNED','sheet',s.id,jsonb_build_object('method','ELECTRONIC_SIMPLE','pdf_sha256',s.pdf_sha256));
  return s.id;
end $$;

create function public.verify_signing_code(p_link uuid, p_otp_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare l public.signing_links%rowtype;
begin
  select * into l from public.signing_links where id=p_link for update;
  if not found or l.consumed_at is not null or l.expires_at <= now() or l.attempts >= 5 then return false; end if;
  if l.otp_hash is null or l.otp_expires_at <= now() or l.otp_hash <> p_otp_hash then
    update public.signing_links set attempts=attempts+1 where id=p_link;
    return false;
  end if;
  return true;
end $$;

create function public.verify_employee_email(p_employee uuid, p_code_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_record public.email_verifications%rowtype; v_email text;
begin
  select personal_email into v_email from public.employees where id=p_employee for update;
  if not found then return false; end if;
  select * into v_record from public.email_verifications where employee_id=p_employee for update;
  if not found or v_record.attempts >= 5 or v_record.expires_at <= now() then return false; end if;
  if v_record.email_address is distinct from v_email or v_record.code_hash <> p_code_hash then
    update public.email_verifications set attempts=attempts+1 where employee_id=p_employee;
    return false;
  end if;
  update public.employees set email_verified_at=now() where id=p_employee;
  delete from public.email_verifications where employee_id=p_employee;
  return true;
end $$;

create function public.confirm_receipt(p_org uuid, p_actor uuid, p_sheet uuid, p_method text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in ('ADMIN','RH','SEGURANCA','ALMOXARIFADO')) then raise exception 'Acesso negado'; end if;
  if not exists (select 1 from public.sheets where id=p_sheet and organization_id=p_org) then raise exception 'Ficha não encontrada'; end if;
  if p_method not in ('IN_PERSON','EMPLOYEE_DECLARATION') or trim(coalesce(p_note,''))='' then raise exception 'Evidência obrigatória'; end if;
  insert into public.receipts(sheet_id,confirmed_by,method,note) values(p_sheet,p_actor,p_method,p_note);
  update public.sheet_state set receipt_status='CONFIRMED',updated_at=now() where sheet_id=p_sheet;
  insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)
    values(p_org,p_actor,'RECEIPT_CONFIRMED','sheet',p_sheet,jsonb_build_object('method',p_method));
end $$;

create function public.purge_signature_ips(p_days integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_days < 30 or p_days > 365 then raise exception 'Retenção inválida'; end if;
  update public.signatures set ip_address=null,user_agent=null
    where signed_at < now() - make_interval(days => p_days) and (ip_address is not null or user_agent is not null);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.receive_stock(uuid,uuid,uuid,integer,text) from public, anon, authenticated;
revoke all on function public.issue_sheet(uuid,uuid,uuid,jsonb,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.complete_signature(uuid,text,inet,text) from public, anon, authenticated;
grant execute on function public.receive_stock(uuid,uuid,uuid,integer,text) to service_role;
grant execute on function public.issue_sheet(uuid,uuid,uuid,jsonb,text,text,text,text,jsonb) to service_role;
grant execute on function public.complete_signature(uuid,text,inet,text) to service_role;
revoke all on function public.verify_signing_code(uuid,text) from public, anon, authenticated;
grant execute on function public.verify_signing_code(uuid,text) to service_role;
revoke all on function public.verify_employee_email(uuid,text) from public, anon, authenticated;
grant execute on function public.verify_employee_email(uuid,text) to service_role;
revoke all on function public.confirm_receipt(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.confirm_receipt(uuid,uuid,uuid,text,text) to service_role;
revoke all on function public.purge_signature_ips(integer) from public, anon, authenticated;
grant execute on function public.purge_signature_ips(integer) to service_role;


-- MIGRATION: 002_audit_email_verification.sql
-- MIGRATION 002 - Auditoria da confirmação do e-mail do colaborador.
-- Requer 001_init.sql.
-- Registra a validação de e-mail sem guardar o código ou o endereço no log.
create or replace function public.verify_employee_email(p_employee uuid, p_code_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_record public.email_verifications%rowtype;
  v_email text;
  v_org uuid;
begin
  select personal_email, organization_id into v_email, v_org
    from public.employees where id=p_employee for update;
  if not found then return false; end if;
  select * into v_record from public.email_verifications where employee_id=p_employee for update;
  if not found or v_record.attempts >= 5 or v_record.expires_at <= now() then return false; end if;
  if v_record.email_address is distinct from v_email or v_record.code_hash <> p_code_hash then
    update public.email_verifications set attempts=attempts+1 where employee_id=p_employee;
    return false;
  end if;
  update public.employees set email_verified_at=now() where id=p_employee;
  delete from public.email_verifications where employee_id=p_employee;
  insert into public.audit_events(organization_id, action, entity, entity_id, detail)
    values(v_org, 'EMPLOYEE_EMAIL_VERIFIED', 'employee', p_employee, '{}'::jsonb);
  return true;
end $$;


-- MIGRATION: 003_manual_signature.sql
-- MIGRATION 003 - Registro de assinatura presencial, independente da entrega física.
-- Requer as migrations anteriores.
create function public.record_manual_signature(p_org uuid, p_actor uuid, p_sheet uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_sheet public.sheets%rowtype;
begin
  select * into v_sheet from public.sheets
    where id=p_sheet and organization_id=p_org for update;
  if not found then raise exception 'Ficha não encontrada'; end if;
  if v_sheet.signature_method <> 'MANUAL' then raise exception 'Ficha configurada para assinatura eletrônica'; end if;
  if not exists (select 1 from public.sheet_state where sheet_id=p_sheet and signature_status='PENDING' for update)
     or exists (select 1 from public.signatures where sheet_id=p_sheet) then
    raise exception 'Ficha já possui registro de assinatura';
  end if;
  insert into public.signatures(sheet_id,method,accepted_terms,document_sha256,actor_id,note)
    values(p_sheet,'MANUAL_RECORDED',true,v_sheet.pdf_sha256,p_actor,p_note);
  update public.sheet_state set signature_status='SIGNED_MANUAL',updated_at=now() where sheet_id=p_sheet;
  insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)
    values(p_org,p_actor,'MANUAL_SIGNATURE_RECORDED','sheet',p_sheet,'{}'::jsonb);
end $$;
revoke all on function public.record_manual_signature(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.record_manual_signature(uuid,uuid,uuid,text) to service_role;


-- MIGRATION: 004_reservations_and_access.sql
-- MIGRATION 004 - Reservas de estoque, idempotência, evidências e controle de acesso.
-- Requer as migrations anteriores.
-- Evolução aditiva: fichas históricas já baixadas são preservadas como LEGACY_ISSUED.
alter table public.memberships drop constraint memberships_role_check;
update public.memberships set role='SEGURANCA_TRABALHO' where role='SEGURANCA';
alter table public.memberships add constraint memberships_role_check check(role in ('ADMIN','ALMOXARIFADO','RH','SEGURANCA_TRABALHO'));
create or replace function public.has_role(p_org uuid,p_roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships where organization_id=p_org and user_id=(select auth.uid()) and (role=any(p_roles) or (role='SEGURANCA_TRABALHO' and 'SEGURANCA'=any(p_roles))))
$$;
alter table public.employees add column phone text not null default '', add column work_unit text not null default '', add column cpf text check(cpf is null or cpf ~ '^[0-9]{11}$'), add column facial_opt_in boolean not null default false;
alter table public.products add column photo_url text check(photo_url is null or photo_url ~ '^https://'), add column unit text not null default 'UN' check(unit='UN'), add column useful_life_days integer check(useful_life_days>0);
alter table public.lots add column reserved_quantity integer not null default 0 check(reserved_quantity>=0), add column unit_cost numeric(12,2) not null default 0 check(unit_cost>=0), add column location text not null default '', add column condition text not null default 'NOVO' check(condition in ('NOVO','BOM','AVARIADO'));
alter table public.lots add constraint lot_reserved_within_stock check(reserved_quantity<=stock_quantity);
alter table public.sheets add column request_key uuid;
create unique index sheets_request_key on public.sheets(organization_id,request_key) where request_key is not null;
alter table public.sheet_state add column reservation_status text not null default 'LEGACY_ISSUED' check(reservation_status in ('LEGACY_ISSUED','RESERVED','DELIVERED','CANCELLED'));

create table public.stock_reservations(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 sheet_id uuid not null references public.sheets(id), item_id uuid not null unique references public.sheet_items(id),
 lot_id uuid not null references public.lots(id), quantity integer not null default 1 check(quantity=1),
 status text not null default 'RESERVED' check(status in ('RESERVED','DELIVERED','CANCELLED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index reservations_lot_status on public.stock_reservations(lot_id,status);
create table public.operation_keys(organization_id uuid not null references public.organizations(id), key uuid not null, operation text not null, payload jsonb not null, result jsonb, created_at timestamptz not null default now(),primary key(organization_id,key));
create table public.request_limits(key text primary key,window_start timestamptz not null,hits integer not null check(hits>0));
create table public.employee_biometrics(id uuid primary key default gen_random_uuid(),employee_id uuid not null unique references public.employees(id),provider_reference text not null,consent_reference text not null,expires_at timestamptz not null,revoked_at timestamptz,created_at timestamptz not null default now());
-- Não contém imagem, embedding ou template facial. Provedor desabilitado por padrão.
create table public.document_attachments(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),sheet_id uuid not null references public.sheets(id),storage_path text not null unique,sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),uploaded_by uuid not null references auth.users(id),created_at timestamptz not null default now());
create table public.signature_evidences(id uuid primary key default gen_random_uuid(),sheet_id uuid not null references public.signatures(sheet_id),kind text not null,evidence jsonb not null,created_at timestamptz not null default now());
create view public.inventory_balances with (security_invoker=true) as select l.id as lot_id,l.variant_id,l.stock_quantity,l.reserved_quantity,l.stock_quantity-l.reserved_quantity as available_quantity from public.lots l;
grant select on public.inventory_balances to authenticated;

do $$ declare t text;begin foreach t in array array['stock_reservations','operation_keys','request_limits','employee_biometrics','document_attachments','signature_evidences'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);
end loop;end $$;
grant select on public.stock_reservations,public.document_attachments,public.signature_evidences to authenticated;
create policy reservations_read on public.stock_reservations for select to authenticated using(public.is_member(organization_id));
create policy attachments_read on public.document_attachments for select to authenticated using(public.has_role(organization_id,array['ADMIN','RH','SEGURANCA_TRABALHO']));
create policy evidence_read on public.signature_evidences for select to authenticated using(exists(select 1 from public.sheets s where s.id=sheet_id and public.has_role(s.organization_id,array['ADMIN','RH','SEGURANCA_TRABALHO'])));
-- Dados pessoais dos documentos e logs não ficam acessíveis ao almoxarifado por REST direto.
alter policy sheets_read on public.sheets using(public.has_role(organization_id,array['ADMIN','RH','SEGURANCA_TRABALHO']));
alter policy audit_read on public.audit_events using(public.has_role(organization_id,array['ADMIN','RH','SEGURANCA_TRABALHO']));
alter policy memberships_read on public.memberships using(user_id=(select auth.uid()) or public.has_role(organization_id,array['ADMIN']));

create function public.operate_stock(p_org uuid,p_actor uuid,p_lot uuid,p_quantity integer,p_reason text,p_adjust boolean,p_key uuid) returns integer language plpgsql security definer set search_path='' as $$
declare v_stock integer;v_existing public.operation_keys%rowtype;v_payload jsonb:=jsonb_build_object('lot',p_lot,'quantity',p_quantity,'reason',p_reason,'adjust',p_adjust);
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in ('ADMIN','ALMOXARIFADO'))then raise exception 'Acesso negado';end if;
 if p_key is null or p_quantity is null or p_adjust is null or p_quantity=0 or abs(p_quantity::bigint)>100000 or(not p_adjust and p_quantity<1) then raise exception 'Quantidade ou chave inválida';end if;
 if p_adjust and length(trim(coalesce(p_reason,'')))<5 then raise exception 'Justificativa obrigatória';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_key::text,0));
 select * into v_existing from public.operation_keys where organization_id=p_org and key=p_key;
 if found then if v_existing.operation<>'STOCK' or v_existing.payload<>v_payload then raise exception 'Chave reutilizada com conteúdo diferente';end if;return(v_existing.result->>'stock')::integer;end if;
 update public.lots l set stock_quantity=stock_quantity+p_quantity from public.variants v join public.products p on p.id=v.product_id
 where l.id=p_lot and l.variant_id=v.id and p.organization_id=p_org and l.stock_quantity+p_quantity>=l.reserved_quantity returning l.stock_quantity into v_stock;
 if not found then raise exception 'Lote não encontrado ou estoque disponível insuficiente';end if;
 insert into public.stock_movements(organization_id,lot_id,type,quantity,actor_id,reason)values(p_org,p_lot,case when p_adjust then 'ADJUSTMENT' else 'RECEIPT' end,p_quantity,p_actor,coalesce(p_reason,''));
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)values(p_org,p_actor,case when p_adjust then 'STOCK_ADJUSTED' else 'STOCK_RECEIVED' end,'lot',p_lot,jsonb_build_object('quantity',p_quantity,'requestKey',p_key));
 insert into public.operation_keys values(p_org,p_key,'STOCK',v_payload,jsonb_build_object('stock',v_stock),now());return v_stock;
end $$;
create or replace function public.receive_stock(p_org uuid,p_actor uuid,p_lot uuid,p_quantity integer,p_reason text default '') returns integer language sql security definer set search_path='' as $$ select public.operate_stock(p_org,p_actor,p_lot,p_quantity,p_reason,false,gen_random_uuid()) $$;

create or replace function public.issue_sheet(p_org uuid,p_actor uuid,p_employee uuid,p_snapshot jsonb,p_snapshot_hash text,p_pdf_hash text,p_pdf_path text,p_method text,p_items jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_sheet uuid;v_version integer;i record;v_item uuid;v_request uuid:=(p_snapshot->>'requestKey')::uuid;v_existing public.sheets%rowtype;
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in ('ADMIN','RH','SEGURANCA_TRABALHO'))then raise exception 'Acesso negado';end if;
 if v_request is null then raise exception 'Chave de idempotência obrigatória';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||v_request::text,0));
 select * into v_existing from public.sheets where organization_id=p_org and request_key=v_request;
 if found then if v_existing.employee_id<>p_employee or v_existing.signature_method<>p_method or v_existing.snapshot->'items' is distinct from p_snapshot->'items' or v_existing.snapshot->>'documentDate' is distinct from p_snapshot->>'documentDate' then raise exception 'Chave reutilizada com conteúdo diferente';end if;return v_existing.id;end if;
 if not exists(select 1 from public.employees where id=p_employee and organization_id=p_org and termination_date is null)then raise exception 'Colaborador ativo não encontrado';end if;
 if p_method is null or p_method not in ('MANUAL','ELECTRONIC') or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 15 then raise exception 'Itens ou método inválidos';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_employee::text,0));
 select coalesce(max(version),0)+1 into v_version from public.sheets where employee_id=p_employee;
 insert into public.sheets(organization_id,employee_id,version,snapshot,snapshot_sha256,pdf_sha256,pdf_path,issued_by,signature_method,request_key)values(p_org,p_employee,v_version,p_snapshot,p_snapshot_hash,p_pdf_hash,p_pdf_path,p_actor,p_method,v_request)returning id into v_sheet;
 for i in select * from jsonb_to_recordset(p_items)as x(variant_id uuid,lot_id uuid,risk text,quantity integer)order by lot_id loop
  if i.quantity is distinct from 1 then raise exception 'Quantidade deve ser sempre 1';end if;
  update public.lots l set reserved_quantity=reserved_quantity+1 from public.variants v join public.products p on p.id=v.product_id
  where l.id=i.lot_id and l.variant_id=i.variant_id and v.id=i.variant_id and p.organization_id=p_org and l.stock_quantity-l.reserved_quantity>=1
  and(l.expires_at is null or l.expires_at>=current_date)and(p.ca_expires_at is null or p.ca_expires_at>=current_date)and p.active and l.condition<>'AVARIADO';
  if not found then raise exception 'Sem estoque válido para o lote %',i.lot_id;end if;
  insert into public.sheet_items(sheet_id,variant_id,lot_id,risk_code,quantity)values(v_sheet,i.variant_id,i.lot_id,coalesce(i.risk,''),1)returning id into v_item;
  insert into public.stock_reservations(organization_id,sheet_id,item_id,lot_id)values(p_org,v_sheet,v_item,i.lot_id);
 end loop;
 insert into public.sheet_state(sheet_id,reservation_status)values(v_sheet,'RESERVED');
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)values(p_org,p_actor,'SHEET_RESERVED','sheet',v_sheet,jsonb_build_object('version',v_version,'method',p_method));return v_sheet;
end $$;

create or replace function public.confirm_receipt(p_org uuid,p_actor uuid,p_sheet uuid,p_method text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare v_state public.sheet_state%rowtype;i record;
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in('ADMIN','RH','SEGURANCA_TRABALHO','ALMOXARIFADO'))then raise exception 'Acesso negado';end if;
 if not exists(select 1 from public.sheets where id=p_sheet and organization_id=p_org)then raise exception 'Ficha não encontrada';end if;
 select * into v_state from public.sheet_state where sheet_id=p_sheet for update;
 if v_state.receipt_status='CONFIRMED'then return;end if;
 if v_state.reservation_status='CANCELLED'then raise exception 'Reserva cancelada';end if;
 if p_method is null or p_method not in('IN_PERSON','EMPLOYEE_DECLARATION')or trim(coalesce(p_note,''))=''then raise exception 'Evidência obrigatória';end if;
 for i in select * from public.stock_reservations where sheet_id=p_sheet and status='RESERVED'order by lot_id loop
  update public.lots set stock_quantity=stock_quantity-1,reserved_quantity=reserved_quantity-1 where id=i.lot_id and stock_quantity>=1 and reserved_quantity>=1;
  if not found then raise exception 'Reserva inconsistente';end if;
  update public.stock_reservations set status='DELIVERED',updated_at=now()where id=i.id;
  insert into public.stock_movements(organization_id,lot_id,type,quantity,sheet_id,actor_id,reason)values(p_org,i.lot_id,'ISSUE',-1,p_sheet,p_actor,p_note);
 end loop;
 insert into public.receipts(sheet_id,confirmed_by,method,note)values(p_sheet,p_actor,p_method,p_note);
 update public.sheet_state set receipt_status='CONFIRMED',reservation_status='DELIVERED',updated_at=now()where sheet_id=p_sheet;
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)values(p_org,p_actor,'RECEIPT_CONFIRMED','sheet',p_sheet,jsonb_build_object('method',p_method));
end $$;
create function public.cancel_reservation(p_org uuid,p_actor uuid,p_sheet uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare v_state public.sheet_state%rowtype;i record;
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in('ADMIN','RH','SEGURANCA_TRABALHO'))then raise exception 'Acesso negado';end if;
 if not exists(select 1 from public.sheets where id=p_sheet and organization_id=p_org)then raise exception 'Ficha não encontrada';end if;
 select * into v_state from public.sheet_state where sheet_id=p_sheet for update;
 if v_state.reservation_status='CANCELLED'then return;end if;
 if v_state.reservation_status<>'RESERVED'or length(trim(coalesce(p_note,'')))<5 then raise exception 'Reserva ou motivo inválidos';end if;
 for i in select * from public.stock_reservations where sheet_id=p_sheet and status='RESERVED'order by lot_id loop
  update public.lots set reserved_quantity=reserved_quantity-1 where id=i.lot_id;
  update public.stock_reservations set status='CANCELLED',updated_at=now()where id=i.id;
 end loop;
 update public.sheet_state set reservation_status='CANCELLED',updated_at=now()where sheet_id=p_sheet;
 update public.signing_links set consumed_at=now(),otp_hash=null where sheet_id=p_sheet and consumed_at is null;
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)values(p_org,p_actor,'RESERVATION_CANCELLED','sheet',p_sheet,jsonb_build_object('reason',p_note));
end $$;

create function public.guard_signature() returns trigger language plpgsql set search_path='' as $$
declare v_org uuid;v_status text;
begin
 select organization_id into v_org from public.sheets where id=new.sheet_id;
 select reservation_status into v_status from public.sheet_state where sheet_id=new.sheet_id for update;
 if v_status='CANCELLED'then raise exception 'Reserva cancelada';end if;
 if new.method='MANUAL_RECORDED'and not exists(select 1 from public.memberships where organization_id=v_org and user_id=new.actor_id and role in('ADMIN','RH','SEGURANCA_TRABALHO'))then raise exception 'Acesso negado';end if;
 return new;
end $$;
create trigger guard_signature before insert on public.signatures for each row execute function public.guard_signature();
create function public.record_signature_evidence() returns trigger language plpgsql set search_path='' as $$
begin insert into public.signature_evidences(sheet_id,kind,evidence)values(new.sheet_id,new.method,jsonb_build_object('sha256',new.document_sha256,'acceptedTerms',new.accepted_terms,'signedAtUtc',new.signed_at,'authentication',case when new.method='ELECTRONIC_SIMPLE'then 'VERIFIED_EMAIL_OTP'else 'OPERATOR_ATTESTATION'end));return new;end $$;
create trigger signature_evidence after insert on public.signatures for each row execute function public.record_signature_evidence();

create function public.consume_request_limit(p_key text,p_limit integer,p_seconds integer)returns boolean language plpgsql security definer set search_path=''as $$
declare v_hits integer;
begin
 if p_limit not between 1 and 1000 or p_seconds not between 10 and 86400 then raise exception 'Limite inválido';end if;
 insert into public.request_limits as limits(key,window_start,hits)values(p_key,now(),1)on conflict(key)do update set hits=case when limits.window_start<now()-make_interval(secs=>p_seconds)then 1 else limits.hits+1 end,window_start=case when limits.window_start<now()-make_interval(secs=>p_seconds)then now()else limits.window_start end returning hits into v_hits;
 delete from public.request_limits where window_start<now()-interval '2 days';return v_hits<=p_limit;
end $$;
create function public.change_member_role(p_org uuid,p_actor uuid,p_user uuid,p_role text)returns void language plpgsql security definer set search_path=''as $$
begin
 perform 1 from public.organizations where id=p_org for update;
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role='ADMIN')or p_actor=p_user then raise exception 'Não é permitido alterar o próprio perfil';end if;
 if p_role is null or p_role not in('ADMIN','ALMOXARIFADO','RH','SEGURANCA_TRABALHO')then raise exception 'Perfil inválido';end if;
 update public.memberships set role=p_role where organization_id=p_org and user_id=p_user;
 if not found then raise exception 'Usuário não pertence à organização';end if;
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)values(p_org,p_actor,'ROLE_CHANGED','membership',p_user,jsonb_build_object('role',p_role));
end $$;
do $$declare signature text;begin foreach signature in array array[
 'operate_stock(uuid,uuid,uuid,integer,text,boolean,uuid)','cancel_reservation(uuid,uuid,uuid,text)','consume_request_limit(text,integer,integer)','change_member_role(uuid,uuid,uuid,text)']loop
 execute 'revoke all on function public.'||signature||' from public,anon,authenticated';execute 'grant execute on function public.'||signature||' to service_role';
end loop;end $$;
revoke all on function public.guard_signature(), public.record_signature_evidence() from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('epi-attachments','epi-attachments',false,5242880,array['application/pdf'])on conflict(id)do nothing;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;


-- MIGRATION: 005_signing_identity.sql
-- MIGRATION 005 - Identidade do signatário, evidências imutáveis e auditoria dos cadastros.
-- Requer as migrations anteriores.
-- Vincula cada desafio ao canal verificado no momento da criação do link.
alter table public.signing_links add column recipient_email text, add column recipient_verified_at timestamptz;
create or replace function public.complete_signature(p_link uuid,p_otp_hash text,p_ip inet,p_agent text)returns uuid language plpgsql security definer set search_path=''as $$
declare l public.signing_links%rowtype;s public.sheets%rowtype;e public.employees%rowtype;
begin
 select * into l from public.signing_links where id=p_link for update;
 if not found or l.consumed_at is not null or l.expires_at<=now()then raise exception 'Link inválido ou expirado';end if;
 if l.attempts>=5 or l.otp_hash is null or l.otp_expires_at<=now()or l.otp_hash<>p_otp_hash or l.previewed_at is null then raise exception 'Código inválido ou expirado';end if;
 select * into s from public.sheets where id=l.sheet_id;
 select * into e from public.employees where id=s.employee_id for update;
 if e.email_verified_at is null or s.signature_method<>'ELECTRONIC' or l.recipient_email is distinct from e.personal_email or l.recipient_verified_at is distinct from e.email_verified_at then raise exception 'Canal verificado mudou. Gere um novo link';end if;
 if exists(select 1 from public.signatures where sheet_id=s.id)then raise exception 'Ficha já assinada';end if;
 insert into public.signatures(sheet_id,link_id,method,accepted_terms,document_sha256,ip_address,user_agent)values(s.id,l.id,'ELECTRONIC_SIMPLE',true,s.pdf_sha256,p_ip,left(p_agent,500));
 update public.signing_links set consumed_at=now(),otp_hash=null where sheet_id=s.id and consumed_at is null;
 update public.sheet_state set signature_status='SIGNED_ELECTRONIC',updated_at=now()where sheet_id=s.id;
 insert into public.audit_events(organization_id,action,entity,entity_id,detail)values(s.organization_id,'SHEET_SIGNED','sheet',s.id,jsonb_build_object('method','ELECTRONIC_SIMPLE','pdf_sha256',s.pdf_sha256));return s.id;
end $$;
create or replace function public.record_signature_evidence()returns trigger language plpgsql set search_path=''as $$
declare v_employee uuid;v_version integer;v_verified timestamptz;
begin
 select employee_id,version into v_employee,v_version from public.sheets where id=new.sheet_id;
 select recipient_verified_at into v_verified from public.signing_links where id=new.link_id;
 insert into public.signature_evidences(sheet_id,kind,evidence)values(new.sheet_id,new.method,jsonb_build_object('sha256',new.document_sha256,'documentVersion',v_version,'employeeId',v_employee,'acceptedTerms',new.accepted_terms,'termsVersion','EPI-ELECTRONIC-SIMPLE-V1','signedAtUtc',new.signed_at,'channelVerifiedAt',v_verified,'authentication',case when new.method='ELECTRONIC_SIMPLE'then 'VERIFIED_EMAIL_OTP'else 'OPERATOR_ATTESTATION'end));return new;
end $$;
create trigger signature_evidence_immutable before update or delete on public.signature_evidences for each row execute function public.reject_sheet_change();
create function public.audit_catalog_write()returns trigger language plpgsql security definer set search_path=''as $$
declare v_org uuid;
begin
 if tg_table_name in('products','employees')then v_org:=new.organization_id;
 elsif tg_table_name='variants'then select organization_id into v_org from public.products where id=new.product_id;
 elsif tg_table_name='lots'then select p.organization_id into v_org from public.variants v join public.products p on p.id=v.product_id where v.id=new.variant_id;end if;
 insert into public.audit_events(organization_id,action,entity,entity_id,detail)values(v_org,'CATALOG_'||tg_op,tg_table_name,new.id,jsonb_build_object('databaseTrigger',true));return new;
end $$;
revoke all on function public.audit_catalog_write()from public,anon,authenticated;
create trigger products_audit after insert or update on public.products for each row execute function public.audit_catalog_write();
create trigger employees_audit after insert or update on public.employees for each row execute function public.audit_catalog_write();
create trigger variants_audit after insert or update on public.variants for each row execute function public.audit_catalog_write();
create trigger lots_created_audit after insert on public.lots for each row execute function public.audit_catalog_write();


-- MIGRATION: 006_inventory_without_lots.sql
-- MIGRATION 006 - Estoque sem lotes e Nº de Registro igual à matrícula do colaborador.
-- Requer 001 a 005; não cria contador nem numeração sequencial por ficha.
-- Additive transition. Old lots, documents, hashes and movements are retained as history.
-- Active stock is now per equipment size (variant), not per lot.
create table public.inventory_stock(
 id uuid primary key references public.variants(id),
 organization_id uuid not null references public.organizations(id),
 stock_quantity integer not null default 0 check(stock_quantity>=0),
 reserved_quantity integer not null default 0 check(reserved_quantity>=0 and reserved_quantity<=stock_quantity),
 blocked_quantity integer not null default 0 check(blocked_quantity>=0 and blocked_quantity+reserved_quantity<=stock_quantity)
);
insert into public.inventory_stock(id,organization_id,stock_quantity,reserved_quantity,blocked_quantity)
 select v.id,p.organization_id,coalesce(sum(l.stock_quantity),0),coalesce(sum(l.reserved_quantity),0),
 coalesce(sum(case when l.condition='AVARIADO' or l.expires_at<current_date then l.stock_quantity-l.reserved_quantity else 0 end),0)
 from public.variants v join public.products p on p.id=v.product_id left join public.lots l on l.variant_id=v.id group by v.id,p.organization_id;
alter table public.inventory_stock enable row level security;
revoke all on public.inventory_stock from anon,authenticated;
grant select on public.inventory_stock to authenticated;
grant select on public.inventory_stock to service_role;
create policy inventory_read on public.inventory_stock for select to authenticated using(public.is_member(organization_id));
alter view public.inventory_balances rename to legacy_lot_balances;
create function public.initialize_variant_stock()returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.inventory_stock(id,organization_id)select new.id,organization_id from public.products where id=new.product_id;
 return new;
end $$;
revoke all on function public.initialize_variant_stock()from public,anon,authenticated;
create trigger variant_inventory after insert on public.variants for each row execute function public.initialize_variant_stock();

alter table public.stock_movements add column variant_id uuid references public.variants(id);
update public.stock_movements m set variant_id=l.variant_id from public.lots l where l.id=m.lot_id;
alter table public.stock_movements alter column lot_id drop not null;
alter table public.stock_movements alter column variant_id set not null;
alter table public.stock_reservations add column variant_id uuid references public.variants(id);
update public.stock_reservations r set variant_id=l.variant_id from public.lots l where l.id=r.lot_id;
alter table public.stock_reservations alter column variant_id set not null;
alter table public.stock_reservations alter column lot_id drop not null;
alter table public.sheet_items alter column lot_id drop not null;
create index reservations_variant_status on public.stock_reservations(variant_id,status);
alter table public.sheets add column employee_registration text;
alter table public.employees add constraint employee_registration_nonblank check(length(trim(registration))>0) not valid;

-- New documents use the employee's enrollment; old snapshots remain untouched.
create function public.enforce_sheet_register()returns trigger language plpgsql security definer set search_path='' as $$
declare v_registration text;
begin
 select registration into v_registration from public.employees where id=new.employee_id and organization_id=new.organization_id for update;
 if v_registration is null or new.snapshot->>'recordNumber' is distinct from v_registration or new.snapshot->'employee'->>'registration' is distinct from v_registration then
  raise exception 'O número de registro deve ser a matrícula do colaborador';
 end if;
 new.employee_registration:=v_registration;
 return new;
end $$;
revoke all on function public.enforce_sheet_register()from public,anon,authenticated;
create trigger sheets_register before insert on public.sheets for each row execute function public.enforce_sheet_register();

create function public.operate_inventory(p_org uuid,p_actor uuid,p_variant uuid,p_quantity integer,p_reason text,p_adjust boolean,p_key uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_stock integer;v_existing public.operation_keys%rowtype;v_payload jsonb:=jsonb_build_object('variant',p_variant,'quantity',p_quantity,'reason',p_reason,'adjust',p_adjust);
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in('ADMIN','ALMOXARIFADO'))then raise exception 'Acesso negado';end if;
 if p_key is null or p_quantity is null or p_adjust is null or p_quantity=0 or abs(p_quantity::bigint)>100000 or(not p_adjust and p_quantity<1)then raise exception 'Quantidade ou chave inválida';end if;
 if p_adjust and length(trim(coalesce(p_reason,'')))<5 then raise exception 'Justificativa obrigatória';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_key::text,0));
 select * into v_existing from public.operation_keys where organization_id=p_org and key=p_key;
 if found then
  if v_existing.operation<>'INVENTORY' or v_existing.payload<>v_payload then raise exception 'Chave reutilizada com conteúdo diferente';end if;
  return(v_existing.result->>'stock')::integer;
 end if;
 update public.inventory_stock set stock_quantity=stock_quantity+p_quantity
 where id=p_variant and organization_id=p_org and stock_quantity+p_quantity>=reserved_quantity+blocked_quantity returning stock_quantity into v_stock;
 if not found then raise exception 'Equipamento não encontrado ou estoque disponível insuficiente';end if;
 insert into public.stock_movements(organization_id,variant_id,type,quantity,actor_id,reason)
 values(p_org,p_variant,case when p_adjust then 'ADJUSTMENT'else 'RECEIPT'end,p_quantity,p_actor,coalesce(p_reason,''));
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)
 values(p_org,p_actor,case when p_adjust then 'STOCK_ADJUSTED'else 'STOCK_RECEIVED'end,'variant',p_variant,jsonb_build_object('quantity',p_quantity,'requestKey',p_key));
 insert into public.operation_keys values(p_org,p_key,'INVENTORY',v_payload,jsonb_build_object('stock',v_stock),now());
 return v_stock;
end $$;
revoke all on function public.operate_inventory(uuid,uuid,uuid,integer,text,boolean,uuid)from public,anon,authenticated;
grant execute on function public.operate_inventory(uuid,uuid,uuid,integer,text,boolean,uuid)to service_role;

create or replace function public.issue_sheet(p_org uuid,p_actor uuid,p_employee uuid,p_snapshot jsonb,p_snapshot_hash text,p_pdf_hash text,p_pdf_path text,p_method text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_sheet uuid;v_version integer;i record;v_item uuid;v_request uuid:=(p_snapshot->>'requestKey')::uuid;v_existing public.sheets%rowtype;
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in('ADMIN','RH','SEGURANCA_TRABALHO'))then raise exception 'Acesso negado';end if;
 if v_request is null then raise exception 'Chave de idempotência obrigatória';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||v_request::text,0));
 select * into v_existing from public.sheets where organization_id=p_org and request_key=v_request;
 if found then
  if v_existing.employee_id<>p_employee or v_existing.signature_method<>p_method or v_existing.snapshot->'items' is distinct from p_snapshot->'items' or v_existing.snapshot->>'documentDate' is distinct from p_snapshot->>'documentDate' then raise exception 'Chave reutilizada com conteúdo diferente';end if;
  return v_existing.id;
 end if;
 if not exists(select 1 from public.employees where id=p_employee and organization_id=p_org and termination_date is null)then raise exception 'Colaborador ativo não encontrado';end if;
 if p_method is null or p_method not in('MANUAL','ELECTRONIC')or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)not between 1 and 15 then raise exception 'Itens ou método inválidos';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_employee::text,0));
 select coalesce(max(version),0)+1 into v_version from public.sheets where employee_id=p_employee;
 insert into public.sheets(organization_id,employee_id,version,snapshot,snapshot_sha256,pdf_sha256,pdf_path,issued_by,signature_method,request_key)
 values(p_org,p_employee,v_version,p_snapshot,p_snapshot_hash,p_pdf_hash,p_pdf_path,p_actor,p_method,v_request)returning id into v_sheet;
 for i in select * from jsonb_to_recordset(p_items)as x(variant_id uuid,risk text,quantity integer)order by variant_id loop
  if i.quantity is distinct from 1 then raise exception 'Quantidade deve ser sempre 1';end if;
  update public.inventory_stock s set reserved_quantity=reserved_quantity+1 from public.variants v join public.products p on p.id=v.product_id
  where s.id=i.variant_id and v.id=s.id and s.organization_id=p_org and p.organization_id=p_org and s.stock_quantity-s.reserved_quantity-s.blocked_quantity>=1
  and(p.ca_expires_at is null or p.ca_expires_at>=current_date)and p.active;
  if not found then raise exception 'Sem estoque válido para o equipamento %',i.variant_id;end if;
  insert into public.sheet_items(sheet_id,variant_id,risk_code,quantity)values(v_sheet,i.variant_id,coalesce(i.risk,''),1)returning id into v_item;
  insert into public.stock_reservations(organization_id,sheet_id,item_id,variant_id)values(p_org,v_sheet,v_item,i.variant_id);
 end loop;
 insert into public.sheet_state(sheet_id,reservation_status)values(v_sheet,'RESERVED');
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)
 values(p_org,p_actor,'SHEET_RESERVED','sheet',v_sheet,jsonb_build_object('version',v_version,'registration',p_snapshot->>'recordNumber','method',p_method));
 return v_sheet;
end $$;

create or replace function public.confirm_receipt(p_org uuid,p_actor uuid,p_sheet uuid,p_method text,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare v_state public.sheet_state%rowtype;i record;
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in('ADMIN','RH','SEGURANCA_TRABALHO','ALMOXARIFADO'))then raise exception 'Acesso negado';end if;
 if not exists(select 1 from public.sheets where id=p_sheet and organization_id=p_org)then raise exception 'Ficha não encontrada';end if;
 select * into v_state from public.sheet_state where sheet_id=p_sheet for update;
 if v_state.receipt_status='CONFIRMED'then return;end if;
 if v_state.reservation_status='CANCELLED'then raise exception 'Reserva cancelada';end if;
 if p_method is null or p_method not in('IN_PERSON','EMPLOYEE_DECLARATION')or trim(coalesce(p_note,''))=''then raise exception 'Evidência obrigatória';end if;
 for i in select * from public.stock_reservations where sheet_id=p_sheet and status='RESERVED'order by variant_id loop
  update public.inventory_stock set stock_quantity=stock_quantity-1,reserved_quantity=reserved_quantity-1 where id=i.variant_id and organization_id=p_org and stock_quantity>=1 and reserved_quantity>=1;
  if not found then raise exception 'Reserva inconsistente';end if;
  update public.stock_reservations set status='DELIVERED',updated_at=now()where id=i.id;
  insert into public.stock_movements(organization_id,variant_id,type,quantity,sheet_id,actor_id,reason)values(p_org,i.variant_id,'ISSUE',-1,p_sheet,p_actor,p_note);
 end loop;
 insert into public.receipts(sheet_id,confirmed_by,method,note)values(p_sheet,p_actor,p_method,p_note);
 update public.sheet_state set receipt_status='CONFIRMED',reservation_status='DELIVERED',updated_at=now()where sheet_id=p_sheet;
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)values(p_org,p_actor,'RECEIPT_CONFIRMED','sheet',p_sheet,jsonb_build_object('method',p_method));
end $$;

create or replace function public.cancel_reservation(p_org uuid,p_actor uuid,p_sheet uuid,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare v_state public.sheet_state%rowtype;i record;
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in('ADMIN','RH','SEGURANCA_TRABALHO'))then raise exception 'Acesso negado';end if;
 if not exists(select 1 from public.sheets where id=p_sheet and organization_id=p_org)then raise exception 'Ficha não encontrada';end if;
 select * into v_state from public.sheet_state where sheet_id=p_sheet for update;
 if v_state.reservation_status='CANCELLED'then return;end if;
 if v_state.reservation_status<>'RESERVED'or length(trim(coalesce(p_note,'')))<5 then raise exception 'Reserva ou motivo inválidos';end if;
 for i in select * from public.stock_reservations where sheet_id=p_sheet and status='RESERVED'order by variant_id loop
  update public.inventory_stock set reserved_quantity=reserved_quantity-1 where id=i.variant_id and organization_id=p_org;
  update public.stock_reservations set status='CANCELLED',updated_at=now()where id=i.id;
 end loop;
 update public.sheet_state set reservation_status='CANCELLED',updated_at=now()where sheet_id=p_sheet;
 update public.signing_links set consumed_at=now(),otp_hash=null where sheet_id=p_sheet and consumed_at is null;
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)values(p_org,p_actor,'RESERVATION_CANCELLED','sheet',p_sheet,jsonb_build_object('reason',p_note));
end $$;

-- Legacy data is readable for auditing, but no new active flow can mutate lots.
revoke execute on function public.operate_stock(uuid,uuid,uuid,integer,text,boolean,uuid)from service_role;
revoke execute on function public.receive_stock(uuid,uuid,uuid,integer,text)from service_role;
create function public.reject_legacy_lot_change()returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Lotes foram desativados; use o estoque por equipamento e tamanho';end $$;
revoke all on function public.reject_legacy_lot_change()from public,anon,authenticated;
create trigger legacy_lots_readonly before insert or update or delete on public.lots for each row execute function public.reject_legacy_lot_change();


-- MIGRATION: 007_manual_receipt.sql
-- MIGRATION 007 - Confirmação conjunta da entrega e assinatura presencial.
-- Mantém a assinatura eletrônica e a entrega física como eventos independentes.
create function public.confirm_manual_receipt(p_org uuid, p_actor uuid, p_sheet uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sheet public.sheets%rowtype;
  v_state public.sheet_state%rowtype;
begin
  if not exists (
    select 1 from public.memberships where organization_id=p_org and user_id=p_actor
      and role in ('ADMIN','RH','SEGURANCA_TRABALHO','ALMOXARIFADO')
  ) then raise exception 'Acesso negado'; end if;
  -- Same lock order as record_manual_signature, including when retried.
  select * into v_sheet from public.sheets
    where id=p_sheet and organization_id=p_org for update;
  if not found then raise exception 'Ficha não encontrada'; end if;
  if v_sheet.signature_method <> 'MANUAL' then
    raise exception 'Ficha configurada para assinatura eletrônica';
  end if;
  select * into v_state from public.sheet_state where sheet_id=p_sheet for update;
  if not found then raise exception 'Estado da ficha não encontrado'; end if;
  if v_state.reservation_status='CANCELLED' then raise exception 'Reserva cancelada'; end if;
  if length(trim(coalesce(p_note,'')))=0 or length(p_note)>500 then
    raise exception 'Informe as observações da entrega e assinatura presencial (até 500 caracteres)';
  end if;
  if v_state.signature_status='PENDING' then
    -- Reuse signature evidence, document hash, audit and existing RH permissions.
    perform public.record_manual_signature(p_org,p_actor,p_sheet,p_note);
  end if;
  -- Failure rolls back the signature too; retries cannot issue stock twice.
  perform public.confirm_receipt(p_org,p_actor,p_sheet,'IN_PERSON',p_note);
end $$;
revoke all on function public.confirm_manual_receipt(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.confirm_manual_receipt(uuid,uuid,uuid,text) to service_role;


-- MIGRATION: 008_typed_signature.sql
-- MIGRATION 008 - Assinatura por nome, com consentimento versionado e evidência imutável.
alter table public.signatures add column signer_name text, add column signature_style text,
 add column terms_version text, add column terms_text text;
alter table public.signatures add constraint signature_style_valid check(signature_style in('classic','handwritten','elegant'));
drop function public.complete_signature(uuid,text,inet,text);
create function public.complete_signature(p_link uuid,p_otp_hash text,p_ip inet,p_agent text,
 p_signer_name text,p_signature_style text,p_terms_version text,p_terms_text text,p_accepted_terms boolean)
returns uuid language plpgsql security definer set search_path=''as $$
declare l public.signing_links%rowtype;s public.sheets%rowtype;e public.employees%rowtype;
begin
 select * into l from public.signing_links where id=p_link for update;
 if not found or l.consumed_at is not null or l.expires_at<=now()then raise exception 'Link inválido ou expirado';end if;
 if l.attempts>=5 or l.otp_hash is null or l.otp_expires_at<=now()or l.otp_hash<>p_otp_hash or l.previewed_at is null then raise exception 'Código inválido ou expirado';end if;
 select * into s from public.sheets where id=l.sheet_id;
 select * into e from public.employees where id=s.employee_id for update;
 if e.email_verified_at is null or s.signature_method<>'ELECTRONIC' or l.recipient_email is distinct from e.personal_email or l.recipient_verified_at is distinct from e.email_verified_at then raise exception 'Canal verificado mudou. Gere um novo link';end if;
 if exists(select 1 from public.signatures where sheet_id=s.id)then raise exception 'Ficha já assinada';end if;
 if p_accepted_terms is distinct from true or p_terms_version is distinct from 'EPI-ELECTRONIC-SIMPLE-V2' or length(coalesce(p_terms_text,''))<100 then raise exception 'Aceite do termo atual obrigatório';end if;
 if p_signature_style is null or p_signature_style not in('classic','handwritten','elegant')then raise exception 'Estilo de assinatura inválido';end if;
 if p_signer_name is null or length(trim(p_signer_name)) not between 2 and 180 or lower(regexp_replace(trim(p_signer_name),'\s+',' ','g')) is distinct from lower(regexp_replace(trim(s.snapshot->'employee'->>'name'),'\s+',' ','g')) then raise exception 'Informe o nome completo do titular da ficha';end if;
 insert into public.signatures(sheet_id,link_id,method,accepted_terms,document_sha256,ip_address,user_agent,signer_name,signature_style,terms_version,terms_text)
 values(s.id,l.id,'ELECTRONIC_SIMPLE',true,s.pdf_sha256,p_ip,left(p_agent,500),trim(p_signer_name),p_signature_style,p_terms_version,p_terms_text);
 update public.signing_links set consumed_at=now(),otp_hash=null where sheet_id=s.id and consumed_at is null;
 update public.sheet_state set signature_status='SIGNED_ELECTRONIC',updated_at=now()where sheet_id=s.id;
 insert into public.audit_events(organization_id,action,entity,entity_id,detail)values(s.organization_id,'SHEET_SIGNED','sheet',s.id,jsonb_build_object('method','ELECTRONIC_SIMPLE','pdf_sha256',s.pdf_sha256,'termsVersion',p_terms_version));
 return s.id;
end $$;
revoke all on function public.complete_signature(uuid,text,inet,text,text,text,text,text,boolean)from public,anon,authenticated;
grant execute on function public.complete_signature(uuid,text,inet,text,text,text,text,text,boolean)to service_role;
create or replace function public.record_signature_evidence()returns trigger language plpgsql set search_path=''as $$
declare v_employee uuid;v_version integer;v_verified timestamptz;
begin
 select employee_id,version into v_employee,v_version from public.sheets where id=new.sheet_id;
 select recipient_verified_at into v_verified from public.signing_links where id=new.link_id;
 insert into public.signature_evidences(sheet_id,kind,evidence)values(new.sheet_id,new.method,jsonb_build_object(
 'sha256',new.document_sha256,'documentVersion',v_version,'employeeId',v_employee,'acceptedTerms',new.accepted_terms,
 'termsVersion',coalesce(new.terms_version,'EPI-ELECTRONIC-SIMPLE-V1'),'termsText',new.terms_text,
 'signerName',new.signer_name,'signatureStyle',new.signature_style,'signedAtUtc',new.signed_at,
 'channelVerifiedAt',v_verified,'authentication',case when new.method='ELECTRONIC_SIMPLE'then 'VERIFIED_EMAIL_OTP'else 'OPERATOR_ATTESTATION'end));return new;
end $$;


-- MIGRATION: 009_standard_equipment_sizes.sql
-- MIGRATION 009 - Tamanhos padronizados de equipamentos
-- Existing values must be reviewed before applying this constraint. Never
-- replace an unknown size silently or rewrite signed sheet snapshots.
alter table public.variants
  add constraint variants_standard_size check (
    size in ('Único', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'XXG', 'XXXG')
    or size ~ '^([1-9]|[1-6][0-9]|70)$'
  );


-- MIGRATION: 010_catalog_ca_inventory.sql
-- MIGRATION 010 - Grade de tamanhos por produto, base pública de C.A. e movimentação com justificativa.
-- Requer 001 a 009. Não altera fichas, snapshots, hashes nem evidências existentes.

-- 1. Tamanhos: cada tamanho marcado é uma variante. Tamanhos com saldo, reserva
-- ou histórico não são removidos; ficam inativos e deixam de aceitar novas fichas.
alter table public.variants add column active boolean not null default true;

create function public.sync_product_sizes(p_org uuid,p_actor uuid,p_product uuid,p_sizes text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v record;v_size text;v_result jsonb:='[]'::jsonb;v_history boolean;
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in('ADMIN','ALMOXARIFADO'))then raise exception 'Acesso negado';end if;
 perform 1 from public.products where id=p_product and organization_id=p_org for update;
 if not found then raise exception 'Equipamento não encontrado';end if;
 if p_sizes is null or cardinality(p_sizes)<1 or cardinality(p_sizes)>81 then raise exception 'Marque ao menos um tamanho';end if;
 if exists(select 1 from unnest(p_sizes)s where s is null or not(s in('Único','PP','P','M','G','GG','XG','XGG','XXG','XXXG') or s ~ '^([1-9]|[1-6][0-9]|70)$'))then raise exception 'Tamanho fora da lista padronizada';end if;
 foreach v_size in array (select array_agg(distinct s) from unnest(p_sizes)s) loop
  select * into v from public.variants where product_id=p_product and size=v_size order by active desc limit 1;
  if not found then
   insert into public.variants(product_id,size,sku,minimum_stock)values(p_product,v_size,'EPI-'||gen_random_uuid()::text,0);
   v_result:=v_result||jsonb_build_object('size',v_size,'result','CREATED');
  elsif not v.active then
   update public.variants set active=true where id=v.id;
   v_result:=v_result||jsonb_build_object('size',v_size,'result','REACTIVATED');
  end if;
 end loop;
 for v in select va.* from public.variants va where va.product_id=p_product and va.active and not(va.size=any(p_sizes)) loop
  select exists(select 1 from public.inventory_stock s where s.id=v.id and(s.stock_quantity>0 or s.reserved_quantity>0 or s.blocked_quantity>0))
   or exists(select 1 from public.stock_movements where variant_id=v.id)
   or exists(select 1 from public.sheet_items where variant_id=v.id)
   or exists(select 1 from public.stock_reservations where variant_id=v.id)
   or exists(select 1 from public.lots where variant_id=v.id) into v_history;
  if v_history then
   update public.variants set active=false where id=v.id;
   v_result:=v_result||jsonb_build_object('size',v.size,'result','DEACTIVATED');
  else
   delete from public.inventory_stock where id=v.id;
   delete from public.variants where id=v.id;
   v_result:=v_result||jsonb_build_object('size',v.size,'result','REMOVED');
  end if;
 end loop;
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)
 values(p_org,p_actor,'PRODUCT_SIZES_SYNCED','product',p_product,jsonb_build_object('changes',v_result));
 return v_result;
end $$;
revoke all on function public.sync_product_sizes(uuid,uuid,uuid,text[])from public,anon,authenticated;
grant execute on function public.sync_product_sizes(uuid,uuid,uuid,text[])to service_role;

-- Same rules as 006, plus: an inactive size cannot be reserved by a new sheet.
create or replace function public.issue_sheet(p_org uuid,p_actor uuid,p_employee uuid,p_snapshot jsonb,p_snapshot_hash text,p_pdf_hash text,p_pdf_path text,p_method text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_sheet uuid;v_version integer;i record;v_item uuid;v_request uuid:=(p_snapshot->>'requestKey')::uuid;v_existing public.sheets%rowtype;
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in('ADMIN','RH','SEGURANCA_TRABALHO'))then raise exception 'Acesso negado';end if;
 if v_request is null then raise exception 'Chave de idempotência obrigatória';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||v_request::text,0));
 select * into v_existing from public.sheets where organization_id=p_org and request_key=v_request;
 if found then
  if v_existing.employee_id<>p_employee or v_existing.signature_method<>p_method or v_existing.snapshot->'items' is distinct from p_snapshot->'items' or v_existing.snapshot->>'documentDate' is distinct from p_snapshot->>'documentDate' then raise exception 'Chave reutilizada com conteúdo diferente';end if;
  return v_existing.id;
 end if;
 if not exists(select 1 from public.employees where id=p_employee and organization_id=p_org and termination_date is null)then raise exception 'Colaborador ativo não encontrado';end if;
 if p_method is null or p_method not in('MANUAL','ELECTRONIC')or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)not between 1 and 15 then raise exception 'Itens ou método inválidos';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_employee::text,0));
 select coalesce(max(version),0)+1 into v_version from public.sheets where employee_id=p_employee;
 insert into public.sheets(organization_id,employee_id,version,snapshot,snapshot_sha256,pdf_sha256,pdf_path,issued_by,signature_method,request_key)
 values(p_org,p_employee,v_version,p_snapshot,p_snapshot_hash,p_pdf_hash,p_pdf_path,p_actor,p_method,v_request)returning id into v_sheet;
 for i in select * from jsonb_to_recordset(p_items)as x(variant_id uuid,risk text,quantity integer)order by variant_id loop
  if i.quantity is distinct from 1 then raise exception 'Quantidade deve ser sempre 1';end if;
  update public.inventory_stock s set reserved_quantity=reserved_quantity+1 from public.variants v join public.products p on p.id=v.product_id
  where s.id=i.variant_id and v.id=s.id and s.organization_id=p_org and p.organization_id=p_org and s.stock_quantity-s.reserved_quantity-s.blocked_quantity>=1
  and(p.ca_expires_at is null or p.ca_expires_at>=current_date)and p.active and v.active;
  if not found then raise exception 'Sem estoque válido para o equipamento %',i.variant_id;end if;
  insert into public.sheet_items(sheet_id,variant_id,risk_code,quantity)values(v_sheet,i.variant_id,coalesce(i.risk,''),1)returning id into v_item;
  insert into public.stock_reservations(organization_id,sheet_id,item_id,variant_id)values(p_org,v_sheet,v_item,i.variant_id);
 end loop;
 insert into public.sheet_state(sheet_id,reservation_status)values(v_sheet,'RESERVED');
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)
 values(p_org,p_actor,'SHEET_RESERVED','sheet',v_sheet,jsonb_build_object('version',v_version,'registration',p_snapshot->>'recordNumber','method',p_method));
 return v_sheet;
end $$;

-- 2. Base pública CAEPI (Ministério do Trabalho), importada por comando e consultada localmente.
-- Dados públicos, sem organização. Acesso somente pela API autenticada (service_role).
create table public.ca_registry(
 ca_number text primary key check(ca_number ~ '^[0-9]{1,10}$'),
 expires_at date,
 status text not null default '',
 equipment_name text not null default '',
 equipment_description text not null default '',
 manufacturer text not null default '',
 brand text not null default '',
 imported_at timestamptz not null default now()
);
alter table public.ca_registry enable row level security;
revoke all on public.ca_registry from anon,authenticated;
grant select,insert,update on public.ca_registry to service_role;
-- Idempotent batch upsert. Within one run (same p_run) the row with the latest validity wins,
-- because the same C.A. can appear in several lines of the export.
create function public.import_ca_batch(p_run timestamptz,p_rows jsonb)returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if p_run is null or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>5000 then raise exception 'Lote inválido';end if;
 insert into public.ca_registry as r(ca_number,expires_at,status,equipment_name,equipment_description,manufacturer,brand,imported_at)
 select x.ca_number,x.expires_at,coalesce(x.status,''),coalesce(x.equipment_name,''),coalesce(x.equipment_description,''),coalesce(x.manufacturer,''),coalesce(x.brand,''),p_run
 from jsonb_to_recordset(p_rows)as x(ca_number text,expires_at date,status text,equipment_name text,equipment_description text,manufacturer text,brand text)
 on conflict(ca_number)do update set expires_at=excluded.expires_at,status=excluded.status,equipment_name=excluded.equipment_name,
  equipment_description=excluded.equipment_description,manufacturer=excluded.manufacturer,brand=excluded.brand,imported_at=excluded.imported_at
 where r.imported_at<>excluded.imported_at or coalesce(r.expires_at,'-infinity'::date)<coalesce(excluded.expires_at,'-infinity'::date);
 get diagnostics v_count=row_count;
 return v_count;
end $$;
revoke all on function public.import_ca_batch(timestamptz,jsonb)from public,anon,authenticated;
grant execute on function public.import_ca_batch(timestamptz,jsonb)to service_role;

-- 3. Movimentação manual: entrada, retirada fora de ficha e ajuste exigem justificativa.
alter table public.stock_movements drop constraint stock_movements_type_check;
alter table public.stock_movements add constraint stock_movements_type_check check(type in('RECEIPT','ISSUE','ADJUSTMENT','WITHDRAWAL','RETURN'));
alter table public.stock_movements add constraint stock_movements_withdrawal_negative check(type<>'WITHDRAWAL' or quantity<0);

create function public.move_inventory(p_org uuid,p_actor uuid,p_variant uuid,p_operation text,p_quantity integer,p_reason text,p_key uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_stock integer;v_delta integer;v_existing public.operation_keys%rowtype;
v_payload jsonb:=jsonb_build_object('variant',p_variant,'operation',p_operation,'quantity',p_quantity,'reason',p_reason);
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in('ADMIN','ALMOXARIFADO'))then raise exception 'Acesso negado';end if;
 if p_key is null or p_quantity is null or p_operation is null or p_operation not in('RECEIPT','WITHDRAWAL','ADJUSTMENT')
  or p_quantity=0 or abs(p_quantity::bigint)>100000 or(p_operation<>'ADJUSTMENT' and p_quantity<1)then raise exception 'Operação, quantidade ou chave inválida';end if;
 if length(trim(coalesce(p_reason,'')))<5 or length(p_reason)>300 then raise exception 'Justificativa obrigatória (5 a 300 caracteres)';end if;
 v_delta:=case when p_operation='WITHDRAWAL' then -p_quantity else p_quantity end;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_key::text,0));
 select * into v_existing from public.operation_keys where organization_id=p_org and key=p_key;
 if found then
  if v_existing.operation<>'INVENTORY_MOVE' or v_existing.payload<>v_payload then raise exception 'Chave reutilizada com conteúdo diferente';end if;
  return(v_existing.result->>'stock')::integer;
 end if;
 if p_operation='RECEIPT' and not exists(select 1 from public.variants v join public.products p on p.id=v.product_id where v.id=p_variant and p.organization_id=p_org and v.active)then
  raise exception 'Tamanho inativo ou não encontrado';
 end if;
 update public.inventory_stock set stock_quantity=stock_quantity+v_delta
 where id=p_variant and organization_id=p_org and stock_quantity+v_delta>=reserved_quantity+blocked_quantity returning stock_quantity into v_stock;
 if not found then raise exception 'Equipamento não encontrado ou estoque disponível insuficiente';end if;
 insert into public.stock_movements(organization_id,variant_id,type,quantity,actor_id,reason)values(p_org,p_variant,p_operation,v_delta,p_actor,trim(p_reason));
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)
 values(p_org,p_actor,case p_operation when 'RECEIPT' then 'STOCK_RECEIVED' when 'WITHDRAWAL' then 'STOCK_WITHDRAWN' else 'STOCK_ADJUSTED' end,'variant',p_variant,jsonb_build_object('quantity',v_delta,'requestKey',p_key));
 insert into public.operation_keys values(p_org,p_key,'INVENTORY_MOVE',v_payload,jsonb_build_object('stock',v_stock),now());
 return v_stock;
end $$;
revoke all on function public.move_inventory(uuid,uuid,uuid,text,integer,text,uuid)from public,anon,authenticated;
grant execute on function public.move_inventory(uuid,uuid,uuid,text,integer,text,uuid)to service_role;
-- The previous function allowed receipts without justification; the API no longer uses it.
revoke execute on function public.operate_inventory(uuid,uuid,uuid,integer,text,boolean,uuid)from service_role;


-- MIGRATION: 011_managed_lists_kits.sql
-- MIGRATION 011 - Listas gerenciadas (clientes, unidades de trabalho, RACs) e kits de EPI por cliente e função.
-- Requer 001 a 010. Os valores existentes de employees.work_unit viram itens da nova lista, sem perda:
-- a coluna textual é mantida como histórico e cada colaborador recebe o vínculo correspondente.

create table public.clients(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name)) between 2 and 160),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index clients_name_unique on public.clients(organization_id,lower(trim(name)));
create table public.work_units(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name)) between 1 and 160),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index work_units_name_unique on public.work_units(organization_id,lower(trim(name)));
create table public.racs(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name)) between 1 and 160),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index racs_name_unique on public.racs(organization_id,lower(trim(name)));

alter table public.employees add column client_id uuid references public.clients(id),
 add column work_unit_id uuid references public.work_units(id);
create table public.employee_racs(
 employee_id uuid not null references public.employees(id),
 rac_id uuid not null references public.racs(id),
 primary key(employee_id,rac_id)
);

-- Preserve current free-text work units as managed items.
insert into public.work_units(organization_id,name)
 select distinct on (organization_id,lower(trim(work_unit))) organization_id,trim(work_unit)
 from public.employees where length(trim(work_unit))>0
 order by organization_id,lower(trim(work_unit)),trim(work_unit);
update public.employees e set work_unit_id=u.id from public.work_units u
 where u.organization_id=e.organization_id and lower(trim(u.name))=lower(trim(e.work_unit)) and length(trim(e.work_unit))>0;

-- Links must stay inside the employee's organization.
create function public.enforce_employee_links()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.client_id is not null and not exists(select 1 from public.clients where id=new.client_id and organization_id=new.organization_id)then raise exception 'Cliente de outra organização';end if;
 if new.work_unit_id is not null and not exists(select 1 from public.work_units where id=new.work_unit_id and organization_id=new.organization_id)then raise exception 'Unidade de outra organização';end if;
 return new;
end $$;
revoke all on function public.enforce_employee_links()from public,anon,authenticated;
create trigger employees_links before insert or update of client_id,work_unit_id,organization_id on public.employees for each row execute function public.enforce_employee_links();

-- Replaces the employee's RACs atomically; every RAC must belong to the same organization.
create function public.set_employee_racs(p_org uuid,p_actor uuid,p_employee uuid,p_racs uuid[])returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in('ADMIN','RH','SEGURANCA_TRABALHO'))then raise exception 'Acesso negado';end if;
 perform 1 from public.employees where id=p_employee and organization_id=p_org for update;
 if not found then raise exception 'Colaborador não encontrado';end if;
 if exists(select 1 from unnest(coalesce(p_racs,'{}'))r where not exists(select 1 from public.racs where id=r and organization_id=p_org))then raise exception 'RAC inválido';end if;
 delete from public.employee_racs where employee_id=p_employee and not(rac_id=any(coalesce(p_racs,'{}')));
 insert into public.employee_racs(employee_id,rac_id)select p_employee,r from unnest(coalesce(p_racs,'{}'))r on conflict do nothing;
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)
 values(p_org,p_actor,'EMPLOYEE_RACS_SET','employee',p_employee,jsonb_build_object('count',cardinality(coalesce(p_racs,'{}'))));
end $$;
revoke all on function public.set_employee_racs(uuid,uuid,uuid,uuid[])from public,anon,authenticated;
grant execute on function public.set_employee_racs(uuid,uuid,uuid,uuid[])to service_role;

-- Kit: starting point for a client + job title. The issued sheet remains the usual snapshot.
create table public.epi_kits(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 client_id uuid not null references public.clients(id),
 job_title text not null check(length(trim(job_title)) between 1 and 120),
 updated_at timestamptz not null default now()
);
create unique index epi_kits_unique on public.epi_kits(organization_id,client_id,lower(trim(job_title)));
create table public.epi_kit_items(
 kit_id uuid not null references public.epi_kits(id) on delete cascade,
 product_id uuid not null references public.products(id),
 quantity integer not null check(quantity between 1 and 15),
 primary key(kit_id,product_id)
);
create function public.save_epi_kit(p_org uuid,p_actor uuid,p_client uuid,p_job_title text,p_items jsonb)returns uuid language plpgsql security definer set search_path='' as $$
declare v_kit uuid;
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in('ADMIN','RH'))then raise exception 'Acesso negado';end if;
 if not exists(select 1 from public.clients where id=p_client and organization_id=p_org)then raise exception 'Cliente não encontrado';end if;
 if length(trim(coalesce(p_job_title,''))) not between 1 and 120 then raise exception 'Função inválida';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 then raise exception 'Inclua ao menos um EPI no kit';end if;
 if exists(select 1 from jsonb_to_recordset(p_items)x(product_id uuid,quantity integer)where x.quantity is null or x.quantity not between 1 and 15
  or not exists(select 1 from public.products p where p.id=x.product_id and p.organization_id=p_org))then raise exception 'Itens do kit inválidos';end if;
 if (select sum(x.quantity) from jsonb_to_recordset(p_items)x(product_id uuid,quantity integer))>15 then raise exception 'O kit pode ter no máximo 15 unidades, o limite da ficha';end if;
 insert into public.epi_kits as k(organization_id,client_id,job_title)values(p_org,p_client,trim(p_job_title))
 on conflict(organization_id,client_id,lower(trim(job_title)))do update set updated_at=now(),job_title=excluded.job_title returning k.id into v_kit;
 delete from public.epi_kit_items where kit_id=v_kit;
 insert into public.epi_kit_items(kit_id,product_id,quantity)select v_kit,x.product_id,x.quantity from jsonb_to_recordset(p_items)x(product_id uuid,quantity integer);
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)values(p_org,p_actor,'EPI_KIT_SAVED','epi_kit',v_kit,jsonb_build_object('items',jsonb_array_length(p_items)));
 return v_kit;
end $$;
revoke all on function public.save_epi_kit(uuid,uuid,uuid,text,jsonb)from public,anon,authenticated;
grant execute on function public.save_epi_kit(uuid,uuid,uuid,text,jsonb)to service_role;

do $$ declare t text;begin foreach t in array array['clients','work_units','racs','employee_racs','epi_kits','epi_kit_items'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
end loop;end $$;
grant select on public.clients,public.work_units,public.racs,public.employee_racs,public.epi_kits,public.epi_kit_items to authenticated;
create policy clients_read on public.clients for select to authenticated using(public.has_role(organization_id,array['ADMIN','RH','SEGURANCA_TRABALHO']));
create policy work_units_read on public.work_units for select to authenticated using(public.has_role(organization_id,array['ADMIN','RH','SEGURANCA_TRABALHO']));
create policy racs_read on public.racs for select to authenticated using(public.has_role(organization_id,array['ADMIN','RH','SEGURANCA_TRABALHO']));
create policy employee_racs_read on public.employee_racs for select to authenticated using(exists(select 1 from public.employees e where e.id=employee_id and public.has_role(e.organization_id,array['ADMIN','RH','SEGURANCA_TRABALHO'])));
create policy kits_read on public.epi_kits for select to authenticated using(public.has_role(organization_id,array['ADMIN','RH','SEGURANCA_TRABALHO']));
create policy kit_items_read on public.epi_kit_items for select to authenticated using(exists(select 1 from public.epi_kits k where k.id=kit_id and public.has_role(k.organization_id,array['ADMIN','RH','SEGURANCA_TRABALHO'])));
-- Same as 005, extended to the managed lists (they carry organization_id).
create or replace function public.audit_catalog_write()returns trigger language plpgsql security definer set search_path=''as $$
declare v_org uuid;
begin
 if tg_table_name in('products','employees','clients','work_units','racs')then v_org:=new.organization_id;
 elsif tg_table_name='variants'then select organization_id into v_org from public.products where id=new.product_id;
 elsif tg_table_name='lots'then select p.organization_id into v_org from public.variants v join public.products p on p.id=v.product_id where v.id=new.variant_id;end if;
 insert into public.audit_events(organization_id,action,entity,entity_id,detail)values(v_org,'CATALOG_'||tg_op,tg_table_name,new.id,jsonb_build_object('databaseTrigger',true));return new;
end $$;
create trigger clients_audit after insert or update on public.clients for each row execute function public.audit_catalog_write();
create trigger work_units_audit after insert or update on public.work_units for each row execute function public.audit_catalog_write();
create trigger racs_audit after insert or update on public.racs for each row execute function public.audit_catalog_write();


-- MIGRATION: 012_sheet_returns.sql
-- MIGRATION 012 - Devolução de EPIs de fichas entregues, somente de acréscimo.
-- Requer 001 a 011. Não altera snapshot, hash, PDF ou evidências da ficha original.
-- Desenho: docs/DEVOLUCAO-DESENHO-20261109.md. Motivos: contracts/returns.mts.

create table public.sheet_returns(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 sheet_id uuid not null references public.sheets(id),
 employee_id uuid not null references public.employees(id),
 returned_on date not null,
 termination boolean not null default false,
 signature_method text not null default 'MANUAL_RECORDED' check(signature_method='MANUAL_RECORDED'),
 signature_note text not null check(length(trim(signature_note)) between 1 and 500),
 recorded_by uuid not null references auth.users(id),
 request_key uuid not null,
 created_at timestamptz not null default now(),
 unique(organization_id,request_key)
);
create table public.sheet_return_items(
 id uuid primary key default gen_random_uuid(),
 return_id uuid not null references public.sheet_returns(id),
 sheet_id uuid not null references public.sheets(id),
 sheet_item_id uuid not null unique references public.sheet_items(id),
 item_index integer not null check(item_index>=0),
 variant_id uuid not null references public.variants(id),
 reason_code integer not null check(reason_code in(1,2,3,4,5,6,7,8,9,10,11,13,14)),
 destination text not null check(destination in('RESTOCK','DISCARD')),
 unique(sheet_id,item_index)
);
create index sheet_returns_sheet on public.sheet_returns(sheet_id);
create index sheet_return_items_return on public.sheet_return_items(return_id);
create trigger sheet_returns_immutable before update or delete on public.sheet_returns for each row execute function public.reject_sheet_change();
create trigger sheet_return_items_immutable before update or delete on public.sheet_return_items for each row execute function public.reject_sheet_change();

create function public.register_sheet_return(p_org uuid,p_actor uuid,p_sheet uuid,p_returned_on date,p_note text,p_items jsonb,p_termination boolean,p_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_sheet public.sheets%rowtype;v_state public.sheet_state%rowtype;v_return uuid;v_existing public.operation_keys%rowtype;
 i record;v_variant uuid;v_item uuid;v_count integer;
 v_payload jsonb:=jsonb_build_object('sheet',p_sheet,'date',p_returned_on,'note',p_note,'items',p_items,'termination',p_termination);
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in('ADMIN','RH','SEGURANCA_TRABALHO'))then raise exception 'Acesso negado';end if;
 if p_key is null then raise exception 'Chave de idempotência obrigatória';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_key::text,0));
 select * into v_existing from public.operation_keys where organization_id=p_org and key=p_key;
 if found then
  if v_existing.operation<>'SHEET_RETURN' or v_existing.payload<>v_payload then raise exception 'Chave reutilizada com conteúdo diferente';end if;
  return(v_existing.result->>'id')::uuid;
 end if;
 select * into v_sheet from public.sheets where id=p_sheet and organization_id=p_org;
 if not found then raise exception 'Ficha não encontrada';end if;
 select * into v_state from public.sheet_state where sheet_id=p_sheet for update;
 if v_state.reservation_status is null or v_state.reservation_status not in('DELIVERED','LEGACY_ISSUED')then raise exception 'Somente fichas entregues aceitam devolução';end if;
 if length(trim(coalesce(p_note,''))) not between 1 and 500 then raise exception 'Informe as observações da assinatura presencial da devolução (até 500 caracteres)';end if;
 if p_returned_on is null or p_returned_on>(now() at time zone 'America/Sao_Paulo')::date or p_returned_on<(v_sheet.issued_at at time zone 'America/Sao_Paulo')::date then raise exception 'Data da devolução inválida';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Itens da devolução inválidos';end if;
 select count(distinct x.item_index) into v_count from jsonb_to_recordset(p_items)x(item_index integer);
 if v_count<>jsonb_array_length(p_items) then raise exception 'Item repetido na devolução';end if;
 insert into public.sheet_returns(organization_id,sheet_id,employee_id,returned_on,termination,signature_note,recorded_by,request_key)
 values(p_org,p_sheet,v_sheet.employee_id,p_returned_on,coalesce(p_termination,false),trim(p_note),p_actor,p_key)returning id into v_return;
 for i in select * from jsonb_to_recordset(p_items)x(item_index integer,reason_code integer,destination text)order by item_index loop
  if i.item_index is null or i.item_index<0 or i.item_index>=jsonb_array_length(v_sheet.snapshot->'items')then raise exception 'Item inexistente na ficha';end if;
  if i.reason_code is null or i.reason_code not in(1,2,3,4,5,6,7,8,9,10,11,13,14)then raise exception 'Motivo de devolução inválido';end if;
  if i.destination is null or i.destination not in('RESTOCK','DISCARD')then raise exception 'Destino inválido';end if;
  v_variant:=nullif(v_sheet.snapshot->'items'->i.item_index->>'variantId','')::uuid;
  if v_variant is null then raise exception 'Item histórico sem vínculo com o estoque';end if;
  select si.id into v_item from public.sheet_items si
   where si.sheet_id=p_sheet and si.variant_id=v_variant and not exists(select 1 from public.sheet_return_items r where r.sheet_item_id=si.id)
   order by si.id limit 1 for update;
  if v_item is null or exists(select 1 from public.sheet_return_items where sheet_id=p_sheet and item_index=i.item_index)then raise exception 'Item já devolvido';end if;
  insert into public.sheet_return_items(return_id,sheet_id,sheet_item_id,item_index,variant_id,reason_code,destination)
  values(v_return,p_sheet,v_item,i.item_index,v_variant,i.reason_code,i.destination);
  if i.destination='RESTOCK' then
   -- Only physical stock grows; reserved and historically blocked quantities are untouched.
   update public.inventory_stock set stock_quantity=stock_quantity+1 where id=v_variant and organization_id=p_org;
   if not found then raise exception 'Estoque do equipamento não encontrado';end if;
   insert into public.stock_movements(organization_id,variant_id,type,quantity,sheet_id,actor_id,reason)
   values(p_org,v_variant,'RETURN',1,p_sheet,p_actor,'Devolução – M.D. '||i.reason_code);
  end if;
  v_item:=null;
 end loop;
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)
 values(p_org,p_actor,'SHEET_RETURN_RECORDED','sheet',p_sheet,jsonb_build_object('returnId',v_return,'items',jsonb_array_length(p_items),'termination',coalesce(p_termination,false),'signature','MANUAL_RECORDED'));
 insert into public.operation_keys values(p_org,p_key,'SHEET_RETURN',v_payload,jsonb_build_object('id',v_return),now());
 return v_return;
end $$;
revoke all on function public.register_sheet_return(uuid,uuid,uuid,date,text,jsonb,boolean,uuid)from public,anon,authenticated;
grant execute on function public.register_sheet_return(uuid,uuid,uuid,date,text,jsonb,boolean,uuid)to service_role;

alter table public.sheet_returns enable row level security;
alter table public.sheet_return_items enable row level security;
revoke all on public.sheet_returns,public.sheet_return_items from anon,authenticated;
grant select on public.sheet_returns,public.sheet_return_items to authenticated;
grant select,insert on public.sheet_returns,public.sheet_return_items to service_role;
create policy sheet_returns_read on public.sheet_returns for select to authenticated using(public.has_role(organization_id,array['ADMIN','RH','SEGURANCA_TRABALHO']));
create policy sheet_return_items_read on public.sheet_return_items for select to authenticated using(exists(select 1 from public.sheet_returns r where r.id=return_id and public.has_role(r.organization_id,array['ADMIN','RH','SEGURANCA_TRABALHO'])));


-- MIGRATION: 013_signer_identity_check.sql
-- MIGRATION 013 - Confirmação do signatário por nome e dígitos do CPF na assinatura por link.
-- Requer 001 a 012. A comparação é feita somente na API (tempo constante); o banco recebe apenas
-- o resultado, conta as tentativas por link e bloqueia o link na quinta falha. Nenhum dígito do
-- CPF é gravado no link, na auditoria ou na evidência. Colaborador sem CPF mantém o fluxo anterior.
alter table public.signing_links
 add column identity_attempts integer not null default 0 check(identity_attempts between 0 and 5),
 add column identity_verified_at timestamptz,
 add column blocked_at timestamptz;

create function public.record_identity_check(p_link uuid,p_valid boolean)returns text language plpgsql security definer set search_path='' as $$
declare l public.signing_links%rowtype;v_org uuid;v_sheet uuid;
begin
 select * into l from public.signing_links where id=p_link for update;
 if not found or l.consumed_at is not null or l.expires_at<=now()then
  if found and l.blocked_at is not null then return 'BLOCKED';end if;
  raise exception 'Link inválido ou expirado';
 end if;
 if l.blocked_at is not null or l.identity_attempts>=5 then return 'BLOCKED';end if;
 select s.organization_id,s.id into v_org,v_sheet from public.sheets s where s.id=l.sheet_id;
 if p_valid is true then
  update public.signing_links set identity_verified_at=now() where id=p_link;
  insert into public.audit_events(organization_id,action,entity,entity_id,detail)
  values(v_org,'SIGNER_IDENTITY_CONFIRMED','sheet',v_sheet,jsonb_build_object('linkId',p_link,'attempts',l.identity_attempts));
  return 'OK';
 end if;
 update public.signing_links set identity_attempts=identity_attempts+1,identity_verified_at=null where id=p_link;
 insert into public.audit_events(organization_id,action,entity,entity_id,detail)
 values(v_org,'SIGNER_IDENTITY_FAILED','sheet',v_sheet,jsonb_build_object('linkId',p_link,'attempt',l.identity_attempts+1));
 if l.identity_attempts+1>=5 then
  -- Blocked links behave as used everywhere; HR must create a new link.
  update public.signing_links set blocked_at=now(),consumed_at=now(),otp_hash=null where id=p_link;
  insert into public.audit_events(organization_id,action,entity,entity_id,detail)
  values(v_org,'SIGNING_LINK_BLOCKED','sheet',v_sheet,jsonb_build_object('linkId',p_link,'reason','IDENTITY_ATTEMPTS'));
  return 'BLOCKED';
 end if;
 return 'INVALID';
end $$;
revoke all on function public.record_identity_check(uuid,boolean)from public,anon,authenticated;
grant execute on function public.record_identity_check(uuid,boolean)to service_role;

-- Same as 008, plus: when the employee has a CPF on file, the link must have a confirmed identity.
create or replace function public.complete_signature(p_link uuid,p_otp_hash text,p_ip inet,p_agent text,
 p_signer_name text,p_signature_style text,p_terms_version text,p_terms_text text,p_accepted_terms boolean)
returns uuid language plpgsql security definer set search_path=''as $$
declare l public.signing_links%rowtype;s public.sheets%rowtype;e public.employees%rowtype;
begin
 select * into l from public.signing_links where id=p_link for update;
 if not found or l.consumed_at is not null or l.blocked_at is not null or l.expires_at<=now()then raise exception 'Link inválido ou expirado';end if;
 if l.attempts>=5 or l.otp_hash is null or l.otp_expires_at<=now()or l.otp_hash<>p_otp_hash or l.previewed_at is null then raise exception 'Código inválido ou expirado';end if;
 select * into s from public.sheets where id=l.sheet_id;
 select * into e from public.employees where id=s.employee_id for update;
 if e.email_verified_at is null or s.signature_method<>'ELECTRONIC' or l.recipient_email is distinct from e.personal_email or l.recipient_verified_at is distinct from e.email_verified_at then raise exception 'Canal verificado mudou. Gere um novo link';end if;
 if e.cpf is not null and l.identity_verified_at is null then raise exception 'Confirmação de identidade obrigatória';end if;
 if exists(select 1 from public.signatures where sheet_id=s.id)then raise exception 'Ficha já assinada';end if;
 if p_accepted_terms is distinct from true or p_terms_version is distinct from 'EPI-ELECTRONIC-SIMPLE-V2' or length(coalesce(p_terms_text,''))<100 then raise exception 'Aceite do termo atual obrigatório';end if;
 if p_signature_style is null or p_signature_style not in('classic','handwritten','elegant')then raise exception 'Estilo de assinatura inválido';end if;
 if p_signer_name is null or length(trim(p_signer_name)) not between 2 and 180 or lower(regexp_replace(trim(p_signer_name),'\s+',' ','g')) is distinct from lower(regexp_replace(trim(s.snapshot->'employee'->>'name'),'\s+',' ','g')) then raise exception 'Informe o nome completo do titular da ficha';end if;
 insert into public.signatures(sheet_id,link_id,method,accepted_terms,document_sha256,ip_address,user_agent,signer_name,signature_style,terms_version,terms_text)
 values(s.id,l.id,'ELECTRONIC_SIMPLE',true,s.pdf_sha256,p_ip,left(p_agent,500),trim(p_signer_name),p_signature_style,p_terms_version,p_terms_text);
 update public.signing_links set consumed_at=now(),otp_hash=null where sheet_id=s.id and consumed_at is null;
 update public.sheet_state set signature_status='SIGNED_ELECTRONIC',updated_at=now()where sheet_id=s.id;
 insert into public.audit_events(organization_id,action,entity,entity_id,detail)values(s.organization_id,'SHEET_SIGNED','sheet',s.id,jsonb_build_object('method','ELECTRONIC_SIMPLE','pdf_sha256',s.pdf_sha256,'termsVersion',p_terms_version,'identityConfirmed',l.identity_verified_at is not null));
 return s.id;
end $$;
revoke all on function public.complete_signature(uuid,text,inet,text,text,text,text,text,boolean)from public,anon,authenticated;
grant execute on function public.complete_signature(uuid,text,inet,text,text,text,text,text,boolean)to service_role;

-- Evidence also records whether the CPF-based confirmation was used (never the digits).
create or replace function public.record_signature_evidence()returns trigger language plpgsql set search_path=''as $$
declare v_employee uuid;v_version integer;v_verified timestamptz;v_identity timestamptz;
begin
 select employee_id,version into v_employee,v_version from public.sheets where id=new.sheet_id;
 select recipient_verified_at,identity_verified_at into v_verified,v_identity from public.signing_links where id=new.link_id;
 insert into public.signature_evidences(sheet_id,kind,evidence)values(new.sheet_id,new.method,jsonb_build_object(
 'sha256',new.document_sha256,'documentVersion',v_version,'employeeId',v_employee,'acceptedTerms',new.accepted_terms,
 'termsVersion',coalesce(new.terms_version,'EPI-ELECTRONIC-SIMPLE-V1'),'termsText',new.terms_text,
 'signerName',new.signer_name,'signatureStyle',new.signature_style,'signedAtUtc',new.signed_at,
 'channelVerifiedAt',v_verified,'identityConfirmedAt',v_identity,
 'authentication',case when new.method='ELECTRONIC_SIMPLE' then case when v_identity is not null then 'VERIFIED_EMAIL_OTP+NAME_CPF_DIGITS' else 'VERIFIED_EMAIL_OTP' end else 'OPERATOR_ATTESTATION' end));return new;
end $$;


-- MIGRATION: 014_kit_without_job_title.sql
-- MIGRATION 014 - Kit de EPI sem função: o "kit geral" do cliente.
-- Requer 001 a 013. Função vazia ('') identifica o kit geral; continua havendo um único kit por
-- cliente e função (o índice epi_kits_unique já trata '' como mais um valor). Nada é convertido.
alter table public.epi_kits drop constraint if exists epi_kits_job_title_check;
alter table public.epi_kits add constraint epi_kits_job_title_check check(length(trim(job_title))<=120);

create or replace function public.save_epi_kit(p_org uuid,p_actor uuid,p_client uuid,p_job_title text,p_items jsonb)returns uuid language plpgsql security definer set search_path='' as $$
declare v_kit uuid;v_job text:=trim(coalesce(p_job_title,''));
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in('ADMIN','RH'))then raise exception 'Acesso negado';end if;
 if not exists(select 1 from public.clients where id=p_client and organization_id=p_org)then raise exception 'Cliente não encontrado';end if;
 if length(v_job)>120 then raise exception 'Função inválida';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 then raise exception 'Inclua ao menos um EPI no kit';end if;
 if exists(select 1 from jsonb_to_recordset(p_items)x(product_id uuid,quantity integer)where x.quantity is null or x.quantity not between 1 and 15
  or not exists(select 1 from public.products p where p.id=x.product_id and p.organization_id=p_org))then raise exception 'Itens do kit inválidos';end if;
 if (select sum(x.quantity) from jsonb_to_recordset(p_items)x(product_id uuid,quantity integer))>15 then raise exception 'O kit pode ter no máximo 15 unidades, o limite da ficha';end if;
 insert into public.epi_kits as k(organization_id,client_id,job_title)values(p_org,p_client,v_job)
 on conflict(organization_id,client_id,lower(trim(job_title)))do update set updated_at=now(),job_title=excluded.job_title returning k.id into v_kit;
 delete from public.epi_kit_items where kit_id=v_kit;
 insert into public.epi_kit_items(kit_id,product_id,quantity)select v_kit,x.product_id,x.quantity from jsonb_to_recordset(p_items)x(product_id uuid,quantity integer);
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)values(p_org,p_actor,'EPI_KIT_SAVED','epi_kit',v_kit,jsonb_build_object('items',jsonb_array_length(p_items),'general',v_job=''));
 return v_kit;
end $$;
revoke all on function public.save_epi_kit(uuid,uuid,uuid,text,jsonb)from public,anon,authenticated;
grant execute on function public.save_epi_kit(uuid,uuid,uuid,text,jsonb)to service_role;

commit;
