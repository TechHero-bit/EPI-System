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
