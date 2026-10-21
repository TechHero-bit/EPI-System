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
