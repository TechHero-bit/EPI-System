-- Executar somente no SQL Editor como administrador do banco.
-- Crie a conta Auth antes. Não contém senhas nem credenciais.
do $$declare org uuid:='00000000-0000-0000-0000-000000000000';actor uuid:='00000000-0000-0000-0000-000000000000';usr uuid:='00000000-0000-0000-0000-000000000000';new_role text:='RH';begin
if not exists(select 1 from public.memberships where organization_id=org and user_id=actor and role='ADMIN')or actor=usr then raise exception 'Administrador ou usuário inválido';end if;
insert into public.memberships(organization_id,user_id,role)values(org,usr,new_role);
insert into public.audit_events(organization_id,actor_id,action,entity,entity_id,detail)values(org,actor,'MEMBER_PROVISIONED','membership',usr,jsonb_build_object('role',new_role));
end $$;
