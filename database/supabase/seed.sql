-- DADOS FICTÍCIOS: executar somente no Supabase local/de desenvolvimento.
-- Não cria contas Auth nem senhas. Provisione o administrador separadamente.
do $$declare org uuid:='10000000-0000-4000-8000-000000000001';i integer;p uuid;v uuid;seeded boolean;
names text[]:=array['Ana Martins','Bruno Almeida','Carla Nunes','Daniel Rocha','Elisa Costa','Felipe Lima','Gabriela Dias','Henrique Souza','Isabela Melo','João Ribeiro'];
equipment text[]:=array['Bota de segurança','Capacete de proteção','Luva mecânica','Cinto paraquedista','Bota impermeável','Capacete com jugular','Luva nitrílica','Cinto com talabarte'];
categories text[]:=array['Botas de segurança','Capacetes de proteção','Luvas de proteção','Cintos de segurança'];
begin
insert into public.organizations(id,name)values(org,'Horizonte - Empresa fictícia')on conflict(id)do nothing;
select exists(select 1 from public.audit_events where organization_id=org and action='DEVELOPMENT_STOCK_SEEDED')into seeded;
for i in 1..10 loop
 -- CPF de teste fictício (válido no dígito verificador), igual para todos. Nunca use CPF real.
 insert into public.employees(id,organization_id,name,registration,department,job_title,admission_date,work_unit,cpf)
 values(md5('epi-demo-employee-'||i)::uuid,org,names[i],'DEMO-'||i,case when i%2=0 then 'Manutenção'else 'Operações'end,'Operador(a)',current_date-90,'Unidade fictícia','93492854010')on conflict(id)do nothing;
end loop;
for i in 1..8 loop
 p:=md5('epi-demo-product-'||i)::uuid;v:=md5('epi-demo-variant-'||i)::uuid;
 insert into public.products(id,organization_id,category,description,brand,model)values(p,org,categories[(i-1)%4+1],equipment[i],'Marca fictícia','DEMO')on conflict(id)do nothing;
 insert into public.variants(id,product_id,size,sku,minimum_stock)values(v,p,'Único','DEMO-EPI-'||i,5)on conflict(id)do nothing;
 if not seeded then update public.inventory_stock set stock_quantity=i*3 where id=v and reserved_quantity=0 and stock_quantity=0;end if;
end loop;
if not seeded then insert into public.audit_events(organization_id,action,entity,entity_id)values(org,'DEVELOPMENT_STOCK_SEEDED','organization',org);end if;
end $$;
