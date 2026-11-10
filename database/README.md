# Banco Supabase

A fonte SQL está em `supabase/migrations/`. Escolha uma forma de instalação; não execute migrations históricas e setup consolidado no mesmo banco.

## Índice numerado das migrations

Os arquivos vão de **001 a 014**, na ordem de aplicação. Em banco com 001 a 009 aplicadas, execute somente 010, 011, 012 e 013, nessa ordem, antes de publicar a API atualizada (a API passa a chamar `move_inventory`, `sync_product_sizes`, `register_sheet_return` e `record_identity_check`).

### Tamanhos padronizados

Novos cadastros aceitam somente `Único`, letras `PP, P, M, G, GG, XG, XGG, XXG, XXXG` e números inteiros de `1` a `70`, sem zeros à esquerda. O contrato compartilhado é `contracts/equipment-sizes.mts`; a API, o modo demonstrativo e a constraint `variants_standard_size` seguem a mesma lista. Os seletores separam letras e números; a montagem da ficha e o catálogo filtram na ordem categoria → tamanho → busca. Trocar a categoria limpa um tamanho que não exista nela.

Antes de aplicar a 009, confira valores legados com a consulta abaixo. Caso retorne linhas, revise cada tamanho e corrija somente o cadastro correspondente para um valor autorizado. A migration rejeita valores fora da lista; não converte tamanhos desconhecidos nem reescreve snapshots de fichas antigas.

```sql
select id, product_id, size from public.variants
where size not in ('Único','PP','P','M','G','GG','XG','XGG','XXG','XXXG')
  and size !~ '^([1-9]|[1-6][0-9]|70)$';
```

| Nº  | Arquivo                                                                                  | Finalidade                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 001 | [001_init.sql](supabase/migrations/001_init.sql)                                         | Estrutura inicial: organizações, perfis, colaboradores, equipamentos, tamanhos, fichas, estoque, assinaturas, entregas, auditoria, permissões e RLS.                                       |
| 002 | [002_audit_email_verification.sql](supabase/migrations/002_audit_email_verification.sql) | Auditoria da confirmação de e-mail, sem registrar endereço ou código no log.                                                                                                               |
| 003 | [003_manual_signature.sql](supabase/migrations/003_manual_signature.sql)                 | Registro da assinatura presencial vinculado ao PDF, sem confirmar entrega física.                                                                                                          |
| 004 | [004_reservations_and_access.sql](supabase/migrations/004_reservations_and_access.sql)   | Reservas, baixa na entrega, cancelamento, idempotência, perfis/RLS, evidências, anexos e limites de requisição. Estrutura biométrica somente preparatória, sem coleta habilitada.          |
| 005 | [005_signing_identity.sql](supabase/migrations/005_signing_identity.sql)                 | Assinatura vinculada ao e-mail verificado, evidências imutáveis e auditoria dos cadastros.                                                                                                 |
| 006 | [006_inventory_without_lots.sql](supabase/migrations/006_inventory_without_lots.sql)     | Estoque por equipamento/tamanho, lotes históricos somente leitura e Nº de Registro igual à matrícula textual. Cria sua própria validação de matrícula, sem depender de contador por ficha. |
| 007 | [007_manual_receipt.sql](supabase/migrations/007_manual_receipt.sql) | Confirmação conjunta da entrega e assinatura presencial, com evidência, auditoria e idempotência. |
| 008 | [008_typed_signature.sql](supabase/migrations/008_typed_signature.sql) | Nome, estilo de assinatura e aceite do termo versionado, com validação transacional e evidência imutável. |
| 009 | [009_standard_equipment_sizes.sql](supabase/migrations/009_standard_equipment_sizes.sql) | Tamanhos padronizados no catálogo |
| 010 | [010_catalog_ca_inventory.sql](supabase/migrations/010_catalog_ca_inventory.sql) | Grade de tamanhos por produto (`variants.active`, `sync_product_sizes`: tamanho com saldo, reserva ou histórico é desativado, não removido), `issue_sheet` recusa tamanho inativo, tabela pública `ca_registry` com `import_ca_batch` idempotente, e `move_inventory` (entrada, retirada fora de ficha e ajuste, todos com justificativa). `operate_inventory` deixa de ser executável pelo serviço. |
| 011 | [011_managed_lists_kits.sql](supabase/migrations/011_managed_lists_kits.sql) | Listas gerenciadas `clients`, `work_units`, `racs`, vínculos do colaborador (`client_id`, `work_unit_id`, `employee_racs`) e kits `epi_kits`/`epi_kit_items` por cliente e função. Converte os textos existentes de `employees.work_unit` em itens de `work_units` e vincula cada colaborador; a coluna textual é mantida. |
| 012 | [012_sheet_returns.sql](supabase/migrations/012_sheet_returns.sql) | Devolução de fichas entregues (`sheet_returns`, `sheet_return_items`, `register_sheet_return`), somente acréscimo, motivo M.D. e destino por item. Desenho em `docs/DEVOLUCAO-DESENHO-20261109.md`. |
| 013 | [013_signer_identity_check.sql](supabase/migrations/013_signer_identity_check.sql) | Confirmação do signatário por nome e dígitos do CPF: tentativas contadas no link (`record_identity_check`), bloqueio na quinta falha e exigência em `complete_signature` quando há CPF cadastrado. |
| 014 | [014_kit_without_job_title.sql](supabase/migrations/014_kit_without_job_title.sql) | Kit sem função (função vazia = kit geral do cliente): relaxa a checagem de `epi_kits.job_title` e `save_epi_kit` aceita função vazia. Nada é convertido. |

### Atualização de 09/11/2026 (010 a 013)

- **010:** antes de aplicar em banco existente, nada precisa ser convertido. Movimentos antigos continuam com os tipos `RECEIPT`, `ISSUE` e `ADJUSTMENT`; os novos tipos são `WITHDRAWAL` (sempre negativo) e `RETURN`.
- **011:** a conversão de `work_unit` agrupa valores iguais ignorando maiúsculas e espaços nas pontas, por organização. Valores vazios ficam sem unidade. Confira o resultado com `select work_unit, work_unit_id from public.employees;`.
- **012:** só fichas `DELIVERED` ou `LEGACY_ISSUED` aceitam devolução. "Volta ao estoque" soma ao saldo físico; "descarte/avaria" não muda saldo. Saldo bloqueado histórico não é liberado.
- **013:** colaboradores sem CPF mantêm o fluxo anterior. Nenhum dígito do CPF é gravado no link, na auditoria ou na evidência.
- **Base CAEPI:** `npm run ca:import -- <arquivo>`; origem e frequência em `docs/CAEPI-IMPORTACAO.md`.
- **CPF de teste:** `supabase/seed.sql` usa o CPF fictício `93492854010` para todos os colaboradores. Para um banco de desenvolvimento já populado, existe `scripts/dev-set-test-cpf.sql` (somente desenvolvimento, fora das migrations). Nunca coloque CPF em migration.

A antiga `202610210001_sheet_register.sql` foi removida: o contador por ficha ficou sem uso. A nova instalação não cria `sheet_number_counters`, `sheet_number_allocations`, `reserve_sheet_number` nem a coluna numérica `sheets.record_number`. A antiga 007 passou a ser a atual 006, com as dependências corrigidas. As outras cinco migrations continuam necessárias; não foram removidas apenas por conterem funções que evoluem nas seguintes.

`setup.sql` não é uma migration adicional: é o consolidado de todas as migrations, gerado por `npm run db:setup`, para instalação em banco novo. `supabase/seed.sql` contém dados fictícios opcionais. O modelo corporativo PDF/Excel está no Backend, não no SQL. Em banco existente, aplique somente as migrations pendentes em ordem: a 007 habilita a confirmação presencial conjunta a 008 habilita o novo registro de assinatura eletrônica e a 009 restringe os tamanhos do catálogo.

Para futuras migrations, use o próximo número disponível, como `010_descricao.sql`, e atualize este índice. Depois da primeira aplicação em um ambiente, não renumere nem reescreva o histórico desse ambiente; acrescente uma nova migration. O gerador do consolidado verifica nomes e sequência sem lacunas.

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

Em banco novo, execute as migrations 001 a 007 em ordem ou o `setup.sql` inteiro, nunca ambos. Os testes desta alteração usam bancos locais PGlite. Não execute `setup.sql` em banco existente.

A regra vigente é **Nº de Registro = matrícula textual do colaborador**, única por organização e obrigatória no cadastro manual. Zeros à esquerda são mantidos. A ficha recebe `employee_registration` e o mesmo valor no snapshot, conferido em trigger. Não existe contador por ficha nem coluna numérica `record_number` no novo esquema. Snapshots anteriores à transição de estoque não são reescritos. A versão por colaborador continua incremental e a emissão mantém idempotência.

`memberships` representa perfil por organização. `products` e `variants` representam equipamento e tamanho/SKU. `inventory_stock` controla saldo físico, reservado e bloqueado por variante. `stock_reservations` contém uma unidade por linha, vinculada a `variant_id`. `sheets/sheet_items` preservam documentos; `sheet_state` separa estados; `receipts` registra entrega; `signatures/signature_evidences` guardam evidências. `operation_keys` garante idempotência e `request_limits` funciona entre instâncias serverless.

Os saldos e reservas antigos são consolidados por variante. Quantidades não reservadas de lotes vencidos ou avariados passam a `blocked_quantity`; não são disponibilizadas silenciosamente. Esses bloqueios exigem revisão administrativa separada antes de eventual liberação, não incluída no fluxo atual. As tabelas antigas de lotes e seus vínculos permanecem para auditoria, mas um trigger impede novas alterações. A view histórica chama-se `legacy_lot_balances`. Novos cadastros/movimentações/fichas não usam lotes. APIs antigas de lotes foram removidas; as funções antigas de mutação e contador não são executáveis pelo serviço.

Departamento, cargo, categoria e fornecedor são valores textuais nesta versão. `employee_biometrics` contém somente referência contratual para provedor futuro, sem imagens ou embeddings. Não há coleta biométrica habilitada.

As funções transacionais validam perfil e organização, bloqueiam os saldos por variante e impedem consumo de unidades reservadas ou bloqueadas. Emissão reserva; confirmação física baixa. Fichas históricas anteriores à reserva recebem LEGACY_ISSUED e não baixam novamente. Cancelamento libera reservas e invalida links. Evidências são imutáveis. Clientes não executam funções de mutação nem alteram perfis diretamente.

## Validar

Execute `schemas/validate.sql` para inspecionar RLS, buckets e saldos. Na raiz, `npm run test:db` executa migrations e setup em bancos PostgreSQL PGlite limpos, com contratos mínimos Auth/Storage. Isso valida SQL, PLpgSQL, constraints e RLS; ainda é necessário testar Auth, Storage, PostgREST e SMTP hospedados com credenciais de desenvolvimento.

`npm run db:setup` gera o consolidado mecanicamente; `npm run db:check` detecta divergências. `seeds/development.sql` é histórico e não deve ser executado no esquema atual. Use somente `supabase/seed.sql` para dados fictícios e faça provisionamento separado. O seed atual não cria lotes e não redefine saldos a cada execução. `tests/fixtures/legacy-seed.sql` é exclusivo dos testes de atualização. Nenhum SQL remoto foi executado nesta entrega.
