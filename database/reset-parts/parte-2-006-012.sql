begin;
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


commit;
