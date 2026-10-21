-- MIGRATION 006 - Numeração sequencial por ficha (regra histórica substituída pela 007).
-- Register is per document and per organization, never the employee's enrollment.
-- Numbers reserved for failed/cancelled emissions are not reused (gaps are intentional).
alter table public.sheets add column record_number bigint;
-- Historical signed records stay untouched. They have no retroactive register.
create unique index sheets_record_number on public.sheets(organization_id,record_number);

create table public.sheet_number_counters(
 organization_id uuid primary key references public.organizations(id),
 last_number bigint not null check(last_number>0)
);
create table public.sheet_number_allocations(
 organization_id uuid not null references public.organizations(id),
 request_key uuid not null,
 record_number bigint not null check(record_number>0),
 allocated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 primary key(organization_id,request_key),unique(organization_id,record_number)
);
alter table public.sheet_number_counters enable row level security;
alter table public.sheet_number_allocations enable row level security;
revoke all on public.sheet_number_counters,public.sheet_number_allocations from anon,authenticated;

create function public.reserve_sheet_number(p_org uuid,p_actor uuid,p_key uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_number bigint;
begin
 if not exists(select 1 from public.memberships where organization_id=p_org and user_id=p_actor and role in('ADMIN','RH','SEGURANCA_TRABALHO'))then raise exception 'Acesso negado';end if;
 if p_key is null then raise exception 'Chave de idempotência obrigatória';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_key::text,0));
 select record_number into v_number from public.sheet_number_allocations where organization_id=p_org and request_key=p_key;
 if found then return v_number;end if;
 -- Historical retries retain their number without changing their signed snapshot.
 select record_number into v_number from public.sheets where organization_id=p_org and request_key=p_key;
 if found and v_number is not null then return v_number;end if;
 insert into public.sheet_number_counters as c(organization_id,last_number)values(p_org,1)
 on conflict(organization_id)do update set last_number=c.last_number+1 returning last_number into v_number;
 insert into public.sheet_number_allocations(organization_id,request_key,record_number,allocated_by)values(p_org,p_key,v_number,p_actor);
 insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)
 values(p_org,p_actor,'SHEET_NUMBER_RESERVED','sheet_request',p_key,jsonb_build_object('recordNumber',v_number));
 return v_number;
end $$;
revoke all on function public.reserve_sheet_number(uuid,uuid,uuid)from public,anon,authenticated;
grant execute on function public.reserve_sheet_number(uuid,uuid,uuid)to service_role;

create function public.enforce_sheet_register()returns trigger language plpgsql security definer set search_path='' as $$
declare v_number bigint;
begin
 select record_number into v_number from public.sheet_number_allocations where organization_id=new.organization_id and request_key=new.request_key;
 if v_number is null or (new.snapshot->>'recordNumber')::bigint is distinct from v_number then raise exception 'Número de registro não reservado ou divergente';end if;
 new.record_number:=v_number;
 return new;
end $$;
revoke all on function public.enforce_sheet_register()from public,anon,authenticated;
create trigger sheets_register before insert on public.sheets for each row execute function public.enforce_sheet_register();
