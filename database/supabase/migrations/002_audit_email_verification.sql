-- MIGRATION 002 - Auditoria da confirmação do e-mail do colaborador.
-- Requer 001_init.sql.
-- Registra a validação de e-mail sem guardar o código ou o endereço no log.
create or replace function public.verify_employee_email(p_employee uuid, p_code_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_record public.email_verifications%rowtype;
  v_email text;
  v_org uuid;
begin
  select personal_email, organization_id into v_email, v_org
    from public.employees where id=p_employee for update;
  if not found then return false; end if;
  select * into v_record from public.email_verifications where employee_id=p_employee for update;
  if not found or v_record.attempts >= 5 or v_record.expires_at <= now() then return false; end if;
  if v_record.email_address is distinct from v_email or v_record.code_hash <> p_code_hash then
    update public.email_verifications set attempts=attempts+1 where employee_id=p_employee;
    return false;
  end if;
  update public.employees set email_verified_at=now() where id=p_employee;
  delete from public.email_verifications where employee_id=p_employee;
  insert into public.audit_events(organization_id, action, entity, entity_id, detail)
    values(v_org, 'EMPLOYEE_EMAIL_VERIFIED', 'employee', p_employee, '{}'::jsonb);
  return true;
end $$;
