-- Consultas de inspeção pós-instalação, sem mutações.
select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename;
select tablename,policyname,roles,cmd from pg_policies where schemaname='public' order by tablename,policyname;
select id,public,file_size_limit from storage.buckets where id in('epi-sheets','epi-attachments');
select count(*)as invalid_balances from public.lots where stock_quantity<0 or reserved_quantity<0 or reserved_quantity>stock_quantity;
select count(*)as invalid_items from public.sheet_items where quantity<>1;
select p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('issue_sheet','operate_stock','confirm_receipt','complete_signature');
