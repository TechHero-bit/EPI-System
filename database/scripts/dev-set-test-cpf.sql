-- ============================================================================
-- SOMENTE DESENVOLVIMENTO. NUNCA EXECUTAR EM PRODUÇÃO OU EM BANCO COM DADOS REAIS.
-- ============================================================================
-- Define o CPF de teste fictício 934.928.540-10 (93492854010) para os colaboradores
-- da organização fictícia do seed (database/supabase/seed.sql), em um banco de
-- desenvolvimento que já foi populado antes da Fase 4 (confirmação por CPF).
-- Não é migration: fica fora de database/supabase/migrations e não entra no setup.sql.
-- Confira o project-ref/host antes de executar. Este script não foi executado pelo agente.
begin;
do $$
begin
  if not exists (select 1 from public.organizations where id = '10000000-0000-4000-8000-000000000001') then
    raise exception 'Organização fictícia do seed não encontrada. Este script é só para o banco de desenvolvimento.';
  end if;
end $$;
update public.employees
   set cpf = '93492854010'
 where organization_id = '10000000-0000-4000-8000-000000000001'
   and registration like 'DEMO-%';
commit;
