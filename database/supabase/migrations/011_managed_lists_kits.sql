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
