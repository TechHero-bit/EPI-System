-- Seed opcional, idempotente e exclusivo para Supabase de desenvolvimento.
-- Substitua o UUID abaixo pelo ID do usuário administrador em Authentication > Users.
do $$
declare
  v_org constant uuid := '10000000-0000-4000-8000-000000000001';
  v_admin constant uuid := '00000000-0000-0000-0000-000000000000';
  v_lot constant uuid := '10000000-0000-4000-8000-000000000005';
  v_inserted integer;
begin
  if v_admin = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Edite v_admin com o UUID do usuário Supabase de desenvolvimento antes de executar.';
  end if;
  if not exists (select 1 from auth.users where id=v_admin) then
    raise exception 'Usuário administrador não existe em auth.users.';
  end if;

  insert into public.organizations(id,name)
    values(v_org,'EPI ERP - Desenvolvimento') on conflict (id) do nothing;
  insert into public.memberships(organization_id,user_id,role)
    values(v_org,v_admin,'ADMIN') on conflict (organization_id,user_id) do update set role='ADMIN';
  insert into public.employees(id,organization_id,name,registration,department,job_title,admission_date)
    values('10000000-0000-4000-8000-000000000002',v_org,'Colaborador de demonstração','DEV-001','Operações','Pessoa demonstradora',current_date)
    on conflict (id) do nothing;
  insert into public.products(id,organization_id,category,description,ca,brand,model,risk_code)
    values('10000000-0000-4000-8000-000000000003',v_org,'Botas','Bota de segurança de demonstração',null,'Modelo de teste','DEV','')
    on conflict (id) do nothing;
  insert into public.variants(id,product_id,size,sku,minimum_stock)
    values('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','Único','DEV-BOTA-UNICO',2)
    on conflict (id) do nothing;
  insert into public.lots(id,variant_id,batch_code,supplier,received_at)
    values(v_lot,'10000000-0000-4000-8000-000000000004','DEV-LOTE-001','Fornecedor de demonstração',current_date)
    on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    perform public.receive_stock(v_org,v_admin,v_lot,10,'Carga inicial para testes - seed de desenvolvimento');
  end if;
end $$;
