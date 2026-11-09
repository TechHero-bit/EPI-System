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
