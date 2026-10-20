-- SQL Editor do projeto correto, como postgres. Substitua os dois UUIDs.
-- Crie a conta primeiro em Authentication > Users, com senha individual segura.
do $$declare org uuid:='00000000-0000-0000-0000-000000000000';usr uuid:='00000000-0000-0000-0000-000000000000';begin
if org='00000000-0000-0000-0000-000000000000'or usr='00000000-0000-0000-0000-000000000000'then raise exception 'Configure org e usr';end if;
if not exists(select 1 from auth.users where id=usr)then raise exception 'Conta Auth não encontrada';end if;
if exists(select 1 from public.memberships where organization_id=org)then raise exception 'Organização já provisionada; use o processo administrativo';end if;
insert into public.organizations(id,name)values(org,'Minha empresa')on conflict(id)do nothing;
insert into public.memberships(organization_id,user_id,role)values(org,usr,'ADMIN');
insert into public.audit_events(organization_id,actor_id,action,entity,entity_id)values(org,usr,'FIRST_ADMIN_PROVISIONED','membership',usr);
end $$;
