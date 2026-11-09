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
