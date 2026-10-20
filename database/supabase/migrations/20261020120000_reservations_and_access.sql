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
