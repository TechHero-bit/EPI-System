# Banco Supabase

A fonte SQL está em `supabase/migrations/`. Escolha uma forma de instalação; não execute migrations históricas e setup consolidado no mesmo banco.

## Índice numerado das migrations

Os arquivos agora começam diretamente com **001 a 006**, na ordem de aplicação. A renumeração foi autorizada após o usuário confirmar que nenhuma migration havia sido executada no Supabase.

| Nº  | Arquivo                                                                                  | Finalidade                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 001 | [001_init.sql](supabase/migrations/001_init.sql)                                         | Estrutura inicial: organizações, perfis, colaboradores, equipamentos, tamanhos, fichas, estoque, assinaturas, entregas, auditoria, permissões e RLS.                                       |
| 002 | [002_audit_email_verification.sql](supabase/migrations/002_audit_email_verification.sql) | Auditoria da confirmação de e-mail, sem registrar endereço ou código no log.                                                                                                               |
| 003 | [003_manual_signature.sql](supabase/migrations/003_manual_signature.sql)                 | Registro da assinatura presencial vinculado ao PDF, sem confirmar entrega física.                                                                                                          |
| 004 | [004_reservations_and_access.sql](supabase/migrations/004_reservations_and_access.sql)   | Reservas, baixa na entrega, cancelamento, idempotência, perfis/RLS, evidências, anexos e limites de requisição. Estrutura biométrica somente preparatória, sem coleta habilitada.          |
| 005 | [005_signing_identity.sql](supabase/migrations/005_signing_identity.sql)                 | Assinatura vinculada ao e-mail verificado, evidências imutáveis e auditoria dos cadastros.                                                                                                 |
| 006 | [006_inventory_without_lots.sql](supabase/migrations/006_inventory_without_lots.sql)     | Estoque por equipamento/tamanho, lotes históricos somente leitura e Nº de Registro igual à matrícula textual. Cria sua própria validação de matrícula, sem depender de contador por ficha. |

A antiga `202610210001_sheet_register.sql` foi removida: o contador por ficha ficou sem uso. A nova instalação não cria `sheet_number_counters`, `sheet_number_allocations`, `reserve_sheet_number` nem a coluna numérica `sheets.record_number`. A antiga 007 passou a ser a atual 006, com as dependências corrigidas. As outras cinco migrations continuam necessárias; não foram removidas apenas por conterem funções que evoluem nas seguintes.

`setup.sql` não é uma migration adicional: é o consolidado das seis migrations, gerado por `npm run db:setup`, para instalação em banco novo. `supabase/seed.sql` contém dados fictícios opcionais. O modelo corporativo PDF/Excel está no Backend, não no SQL.

Para futuras migrations, use o próximo número disponível, como `007_descricao.sql`, e atualize este índice. Depois da primeira aplicação em um ambiente, não renumere nem reescreva o histórico desse ambiente; acrescente uma nova migration. O gerador do consolidado verifica nomes e sequência sem lacunas.

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

No projeto hospedado, confira o project-ref antes de qualquer execução. Este conjunto renumerado foi preparado antes da primeira instalação, conforme confirmação do usuário. Se houver um ambiente com as versões antigas já registradas, não aplique os novos nomes diretamente: será necessário um plano separado de compatibilização do histórico, sem executar novamente a inicial.

## Modelo

### Atualização de 21/10/2026

Em banco novo, execute as migrations 001 a 006 em ordem ou o `setup.sql` inteiro, nunca ambos. A aplicação no Supabase hospedado depende de autorização; os testes desta alteração usam bancos locais PGlite. Não execute `setup.sql` em banco existente.

A regra vigente é **Nº de Registro = matrícula textual do colaborador**, única por organização e obrigatória no cadastro manual. Zeros à esquerda são mantidos. A ficha recebe `employee_registration` e o mesmo valor no snapshot, conferido em trigger. Não existe contador por ficha nem coluna numérica `record_number` no novo esquema. Snapshots anteriores à transição de estoque não são reescritos. A versão por colaborador continua incremental e a emissão mantém idempotência.

`memberships` representa perfil por organização. `products` e `variants` representam equipamento e tamanho/SKU. `inventory_stock` controla saldo físico, reservado e bloqueado por variante. `stock_reservations` contém uma unidade por linha, vinculada a `variant_id`. `sheets/sheet_items` preservam documentos; `sheet_state` separa estados; `receipts` registra entrega; `signatures/signature_evidences` guardam evidências. `operation_keys` garante idempotência e `request_limits` funciona entre instâncias serverless.

Os saldos e reservas antigos são consolidados por variante. Quantidades não reservadas de lotes vencidos ou avariados passam a `blocked_quantity`; não são disponibilizadas silenciosamente. Esses bloqueios exigem revisão administrativa separada antes de eventual liberação, não incluída no fluxo atual. As tabelas antigas de lotes e seus vínculos permanecem para auditoria, mas um trigger impede novas alterações. A view histórica chama-se `legacy_lot_balances`. Novos cadastros/movimentações/fichas não usam lotes. APIs antigas de lotes foram removidas; as funções antigas de mutação e contador não são executáveis pelo serviço.

Departamento, cargo, categoria e fornecedor são valores textuais nesta versão. `employee_biometrics` contém somente referência contratual para provedor futuro, sem imagens ou embeddings. Não há coleta biométrica habilitada.

As funções transacionais validam perfil e organização, bloqueiam os saldos por variante e impedem consumo de unidades reservadas ou bloqueadas. Emissão reserva; confirmação física baixa. Fichas históricas anteriores à reserva recebem LEGACY_ISSUED e não baixam novamente. Cancelamento libera reservas e invalida links. Evidências são imutáveis. Clientes não executam funções de mutação nem alteram perfis diretamente.

## Validar

Execute `schemas/validate.sql` para inspecionar RLS, buckets e saldos. Na raiz, `npm run test:db` executa migrations e setup em bancos PostgreSQL PGlite limpos, com contratos mínimos Auth/Storage. Isso valida SQL, PLpgSQL, constraints e RLS; ainda é necessário testar Auth, Storage, PostgREST e SMTP hospedados com credenciais de desenvolvimento.

`npm run db:setup` gera o consolidado mecanicamente; `npm run db:check` detecta divergências. `seeds/development.sql` é histórico e não deve ser executado no esquema atual. Use somente `supabase/seed.sql` para dados fictícios e faça provisionamento separado. O seed atual não cria lotes e não redefine saldos a cada execução. `tests/fixtures/legacy-seed.sql` é exclusivo dos testes de atualização. Nenhum SQL remoto foi executado nesta entrega.
