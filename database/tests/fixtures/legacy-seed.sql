-- Historical fixture used only to test upgrades from the original lot-based schema.
do $$declare org uuid:='10000000-0000-4000-8000-000000000001';i integer;p uuid;v uuid;l uuid;
names text[]:=array['Ana Martins','Bruno Almeida','Carla Nunes','Daniel Rocha','Elisa Costa','Felipe Lima','Gabriela Dias','Henrique Souza','Isabela Melo','João Ribeiro'];
equipment text[]:=array['Bota de segurança','Capacete de proteção','Luva mecânica','Cinto paraquedista','Bota impermeável','Capacete com jugular','Luva nitrílica','Cinto com talabarte'];
categories text[]:=array['Botas de segurança','Capacetes de proteção','Luvas de proteção','Cintos de segurança'];
begin
insert into public.organizations(id,name)values(org,'Horizonte - Empresa fictícia')on conflict(id)do nothing;
for i in 1..10 loop
 insert into public.employees(id,organization_id,name,registration,department,job_title,admission_date,work_unit)
 values(md5('epi-demo-employee-'||i)::uuid,org,names[i],'DEMO-'||i,'Operações','Operador(a)',current_date-90,'Unidade fictícia')on conflict(id)do nothing;
end loop;
for i in 1..8 loop
 p:=md5('epi-demo-product-'||i)::uuid;v:=md5('epi-demo-variant-'||i)::uuid;l:=md5('epi-demo-lot-'||i)::uuid;
 insert into public.products(id,organization_id,category,description,brand,model)values(p,org,categories[(i-1)%4+1],equipment[i],'Marca fictícia','DEMO')on conflict(id)do nothing;
 insert into public.variants(id,product_id,size,sku,minimum_stock)values(v,p,'Único','DEMO-EPI-'||i,5)on conflict(id)do nothing;
 insert into public.lots(id,variant_id,batch_code,supplier,stock_quantity,location)values(l,v,'DEMO-LOTE-'||i,'Fornecedor fictício',i*3,'A-'||i)on conflict(id)do nothing;
end loop;
end $$;
