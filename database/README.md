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

Em instalação existente com todas as migrations anteriores, aplique somente `supabase/migrations/202610210001_sheet_register.sql`. Ela adiciona o registro sequencial por ficha/organização, reserva idempotente e validação entre número reservado e snapshot. Não atualiza PDFs nem snapshots históricos. Não execute `setup.sql` em banco existente. A aplicação dessa migration em Supabase hospedado ainda depende de revisão e autorização; nesta tarefa os testes executam bancos locais PGlite.

O contador usa UPSERT com bloqueio de linha e alocação única por organização/chave. Emissões canceladas ou tentativas com falha não reutilizam números. As duas tabelas de controle têm RLS e não são acessíveis diretamente ao cliente; apenas o serviço autorizado pode reservar números. A matrícula do funcionário não participa da sequência.

`memberships` representa perfil por organização. `products`, `variants` e `lots` representam equipamento, tamanho/SKU e lote. `stock_reservations` contém uma unidade por linha; `inventory_balances` é uma view com security_invoker. `sheets/sheet_items` preservam documentos; `sheet_state` separa estados; `receipts` registra entrega; `signatures/signature_evidences` guardam evidências. `operation_keys` garante idempotência e `request_limits` funciona entre instâncias serverless.

Departamento, cargo, categoria e fornecedor são valores textuais nesta versão. `employee_biometrics` contém somente referência contratual para provedor futuro, sem imagens ou embeddings. Não há coleta biométrica habilitada.

As funções transacionais validam perfil e organização, bloqueiam lotes e impedem saldo negativo. Emissão reserva; confirmação física baixa. Fichas históricas anteriores à reserva recebem LEGACY_ISSUED e não baixam novamente. Cancelamento libera reservas e invalida links. Evidências são imutáveis. Clientes não executam funções de mutação nem alteram perfis diretamente.

## Validar

Execute `schemas/validate.sql` para inspecionar RLS, buckets e saldos. Na raiz, `npm run test:db` executa migrations e setup em bancos PostgreSQL PGlite limpos, com contratos mínimos Auth/Storage. Isso valida SQL, PLpgSQL, constraints e RLS; ainda é necessário testar Auth, Storage, PostgREST e SMTP hospedados com credenciais de desenvolvimento.

`npm run db:setup` gera o consolidado mecanicamente; `npm run db:check` detecta divergências. O seed antigo em `seeds/development.sql` permanece para compatibilidade com o procedimento anterior. Na instalação nova, use `supabase/seed.sql` e provisionamento separado. Nenhum SQL remoto foi executado nesta entrega.
