# Banco Supabase

A fonte SQL está em `supabase/migrations/`. Escolha uma forma de instalação; não execute migrations históricas e setup consolidado no mesmo banco.

## SQL Editor: projeto novo

Execute `setup.sql` inteiro no SQL Editor de um projeto Supabase novo. A instalação usa uma transação e recusa uma estrutura EPI existente. Cria tabelas, índices, constraints, funções, triggers, RLS e buckets privados. Não cria contas Auth nem altera usuários reais.

Opcionalmente, em desenvolvimento, execute `supabase/seed.sql`: 10 colaboradores fictícios e 8 equipamentos. Crie uma conta em Authentication > Users e preencha os UUIDs de `functions/provision-first-admin.sql`. A organização do seed é `10000000-0000-4000-8000-000000000001`. Contas posteriores usam `functions/provision-member.sql`; alterações de perfil de contas vinculadas podem ser feitas pela Administração do portal.

## Supabase CLI local

Requisitos: Docker ativo e Supabase CLI. No PowerShell:

```powershell
Set-Location C:\Dev\EPI-System\database
npx supabase start
npx supabase migration up --local
```

Somente em banco **local descartável**, `npx supabase db reset --local` reaplica migrations e seed apagando os dados locais. Não execute reset em banco com dados a preservar. As portas locais são 54321/54322/54323.

No projeto hospedado, confira o project-ref e liste o histórico antes de aplicar migrations. Se o banco antigo foi instalado pelo SQL Editor, registre corretamente o histórico antes de aplicar somente as migrations pendentes. As três migrations iniciais foram movidas de `database/migrations/` para `database/supabase/migrations/`; foi removida apenas a dependência desnecessária de pgcrypto para UUID nativo. Não execute a inicial novamente em um banco existente.

## Modelo

### Atualização de 21/10/2026

Em instalação existente, confira o histórico e aplique apenas migrations pendentes em ordem. A atual é `supabase/migrations/202610210002_inventory_without_lots.sql`. Se a anterior `202610210001_sheet_register.sql` ainda não estiver aplicada, execute-a antes. Não execute `setup.sql` em banco existente. A aplicação no Supabase hospedado depende de revisão e autorização; nesta tarefa os testes usam bancos locais PGlite.

A regra vigente é **Nº de Registro = matrícula textual do colaborador**, única por organização e obrigatória no cadastro manual. Zeros à esquerda são mantidos. A ficha recebe `employee_registration` e o mesmo valor no snapshot, conferido em trigger; `record_number` numérico e snapshots antigos são preservados apenas para o histórico. O contador por ficha da migration anterior foi desativado para novas operações. A versão por colaborador continua incremental e a emissão mantém idempotência.

`memberships` representa perfil por organização. `products` e `variants` representam equipamento e tamanho/SKU. `inventory_stock` controla saldo físico, reservado e bloqueado por variante. `stock_reservations` contém uma unidade por linha, vinculada a `variant_id`. `sheets/sheet_items` preservam documentos; `sheet_state` separa estados; `receipts` registra entrega; `signatures/signature_evidences` guardam evidências. `operation_keys` garante idempotência e `request_limits` funciona entre instâncias serverless.

Os saldos e reservas antigos são consolidados por variante. Quantidades não reservadas de lotes vencidos ou avariados passam a `blocked_quantity`; não são disponibilizadas silenciosamente. Esses bloqueios exigem revisão administrativa separada antes de eventual liberação, não incluída no fluxo atual. As tabelas antigas de lotes e seus vínculos permanecem para auditoria, mas um trigger impede novas alterações. A view histórica chama-se `legacy_lot_balances`. Novos cadastros/movimentações/fichas não usam lotes. APIs antigas de lotes foram removidas; as funções antigas de mutação e contador não são executáveis pelo serviço.

Departamento, cargo, categoria e fornecedor são valores textuais nesta versão. `employee_biometrics` contém somente referência contratual para provedor futuro, sem imagens ou embeddings. Não há coleta biométrica habilitada.

As funções transacionais validam perfil e organização, bloqueiam os saldos por variante e impedem consumo de unidades reservadas ou bloqueadas. Emissão reserva; confirmação física baixa. Fichas históricas anteriores à reserva recebem LEGACY_ISSUED e não baixam novamente. Cancelamento libera reservas e invalida links. Evidências são imutáveis. Clientes não executam funções de mutação nem alteram perfis diretamente.

## Validar

Execute `schemas/validate.sql` para inspecionar RLS, buckets e saldos. Na raiz, `npm run test:db` executa migrations e setup em bancos PostgreSQL PGlite limpos, com contratos mínimos Auth/Storage. Isso valida SQL, PLpgSQL, constraints e RLS; ainda é necessário testar Auth, Storage, PostgREST e SMTP hospedados com credenciais de desenvolvimento.

`npm run db:setup` gera o consolidado mecanicamente; `npm run db:check` detecta divergências. `seeds/development.sql` é histórico e não deve ser executado no esquema atual. Use somente `supabase/seed.sql` para dados fictícios e faça provisionamento separado. O seed atual não cria lotes e não redefine saldos a cada execução. `tests/fixtures/legacy-seed.sql` é exclusivo dos testes de atualização. Nenhum SQL remoto foi executado nesta entrega.
