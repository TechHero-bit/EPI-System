-- GERADO: npm run db:setup. Apenas projeto Supabase NOVO.
-- Não combinar com a execução das migrations no mesmo banco.
begin;
do $$begin if to_regclass('public.organizations') is not null then raise exception 'Estrutura EPI já existe. Use somente as migrations pendentes.';end if;end $$;

-- MIGRATION: 202610190001_init.sql
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


-- MIGRATION: 202610200001_audit_email_verification.sql
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


-- MIGRATION: 202610200002_manual_signature.sql
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


-- MIGRATION: 20261020120000_reservations_and_access.sql
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


-- MIGRATION: 20261020130000_signing_identity.sql
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

commit;
