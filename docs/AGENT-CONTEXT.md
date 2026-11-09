# Contexto do projeto para agentes

Este documento é um mapa de entrada para agentes que vão trabalhar no EPI System. Ele resume o estado e as decisões atuais; não substitui os contratos, migrations nem a documentação específica. Atualize este arquivo quando uma mudança alterar uma regra estrutural ou operacional.

## Visão geral

EPI System é um ERP web para gestão de Equipamentos de Proteção Individual (EPIs), com dois setores principais: RH/Segurança do Trabalho e Almoxarifado. O monorepo usa Angular e TypeScript no frontend, Express e TypeScript na API, Supabase (Auth, Postgres e Storage) no modo real e npm workspaces. O modo demonstração é local ao navegador e funciona sem a API ou credenciais externas.

- Repositório de trabalho: `C:\Dev\EPI-System`.
- Repositório oficial indicado no README: `TechHero-bit/EPI-System`.
- Workspaces npm: `Frontend/` e `Backend/`; dependências compartilhadas e scripts ficam na raiz.
- Runtime esperado: Node.js 24.15+ e npm.
- A interface e a documentação do produto estão em português.
- Não há um `AGENTS.md` próprio do projeto conhecido; arquivos homônimos encontrados em `node_modules` pertencem a dependências e devem ser ignorados.

## Como começar

```powershell
Set-Location C:\Dev\EPI-System
npm ci
npm run dev:web
```

Abra `http://localhost:4200` e escolha **Entrar na demonstração**. Para o modo real, configure `.env` com base em `.env.example`, instale o banco conforme `database/README.md` e execute `npm run dev:api` e `npm run dev:web` em terminais separados. A demonstração não chama a API; falhas do modo real não fazem fallback silencioso para dados fictícios.

Comandos principais da raiz:

| Comando | Uso |
| --- | --- |
| `npm run dev:web` | Servidor Angular de desenvolvimento |
| `npm run dev:api` | API Express de desenvolvimento |
| `npm run build` | Builds do frontend e backend |
| `npm run typecheck` | Typecheck do frontend e backend |
| `npm test` | Testes backend, demonstração e SQL/PGlite |
| `npm run test:browser` | Testes de navegador Playwright |
| `npm run db:check` | Confere se `database/setup.sql` corresponde às migrations |
| `npm run db:setup` | Regenera o SQL consolidado após migration |
| `npm run api:docs` | Regenera `docs/openapi.json` a partir da especificação TypeScript |
| `npm run ca:import -- <arquivo>` | Importa a base pública CAEPI para `ca_registry` (ver `docs/CAEPI-IMPORTACAO.md`) |

Execute as verificações adequadas à mudança; não assuma que testes locais validam serviços hospedados.

## Estrutura e onde procurar

```text
Backend/
  api/index.ts                 adaptador serverless Vercel
  src/app.ts                   configuração Express e montagem das rotas
  src/routes/                  endpoints por domínio
  src/controllers/             autenticação, autorização e orquestração HTTP
  src/schemas/                 validação de payloads com Zod
  src/services/                regras de negócio, Supabase e documentos
  src/middlewares/              erros e rate limiting
  src/config/                  ambiente e OpenAPI
  src/assets/                  modelo corporativo e fontes de assinatura
  test/                        testes da API e dos serviços
Frontend/
  src/app/app.routes.ts        rotas, lazy loading e perfis permitidos
  src/app/core/models/         modelos compartilhados da interface
  src/app/core/services/       sessão/API e repositório da demonstração
  src/app/core/guards/         proteção de rotas
  src/app/layout/              shell e navegação
  src/app/features/            páginas por domínio
  src/app/shared/              componentes e utilitários comuns
  test/                        testes de regras da demonstração
  e2e/                         fluxos em navegador
database/
  supabase/migrations/         fonte de verdade SQL, migrations 001–013
  setup.sql                    consolidação gerada de todas as migrations
  scripts/dev-set-test-cpf.sql somente desenvolvimento; nunca em produção
  supabase/seed.sql            dados fictícios opcionais para desenvolvimento
  functions/                   provisionamento restrito de membros
  tests/                       validações PostgreSQL/PGlite e fixtures
  schemas/validate.sql         inspeção do estado instalado
contracts/                     contratos compartilhados: assinatura, tamanhos, alertas de C.A. e devoluções
docs/                           arquitetura, validação, decisões e relatórios
```

Páginas Angular normalmente têm arquivos `.page.ts` e `.page.html` separados. Consulte primeiro o serviço de domínio correspondente antes de alterar regras; a tela não é a única camada de validação.

## Fluxos e regras de negócio atuais

### Perfis e áreas

- `ADMIN`: administração, RH e estoque conforme permissões previstas. Somente ADMIN gerencia as listas de clientes, unidades de trabalho e RACs.
- `RH` e `SEGURANCA_TRABALHO`: colaboradores e fichas.
- `ALMOXARIFADO`: catálogo, estoque e movimentações; não acessa CPF nem documentos pessoais de RH.
- O frontend protege rotas para navegação, mas a autorização real também é verificada pela API e pelo banco/RLS.
- Há um dashboard, adaptado ao perfil. `/rh` e `/almoxarifado` redirecionam para ele. Todos os perfis veem o card de validade dos C.A.
- A demonstração oferece apenas os perfis RH e Almoxarifado no login (decisão anterior mantida); as telas de ADMIN não são navegáveis na demonstração.

### Fichas, assinatura e entrega

- Uma ficha emitida é um snapshot documental imutável com hash e versão. Alterações posteriores ao cadastro não reescrevem documentos antigos.
- O número de registro das novas fichas é a matrícula textual do colaborador, exclusiva por organização; zeros à esquerda são significativos. A versão da ficha continua incremental.
- Cada linha da ficha representa exatamente uma unidade. O operador não informa quantidades variáveis.
- Preparar/emissão reserva estoque transacionalmente; isso não reduz o saldo físico.
- Assinatura eletrônica e entrega física são eventos distintos. A assinatura não comprova recebimento nem baixa estoque.
- A confirmação física consome a reserva uma vez, registra evidência e produz a movimentação. Cancelar uma ficha pendente libera reservas e invalida o link. Idempotência e locks protegem operações concorrentes.
- A assinatura eletrônica simples usa link/token aleatório (HMAC persistido), OTP enviado ao e-mail verificado, documento exibido antes do aceite e evidências imutáveis. Limites atuais: link de 24 horas, OTP de 10 minutos, cinco tentativas e até três envios por link. Termos e estilos estão em `contracts/signature.mts`.
- A assinatura presencial pode registrar operador e evidência; anexos digitalizados ficam em bucket privado. Fichas legadas que já consumiram estoque não devem gerar nova baixa.
- Na assinatura por link, se o colaborador tem CPF cadastrado, a confirmação exige nome completo + 3 primeiros + 3 últimos dígitos do CPF, comparados só na API em tempo constante. Cinco erros por link (contados no Postgres) bloqueiam o link; o RH gera outro. O CPF ou parte dele nunca vai para a página pública, logs, auditoria ou evidência. Sem CPF, o fluxo anterior continua.
- CPF de teste fictício `93492854010` em seed, demonstração e fixtures; nunca em migration.
- Cancelamento de ficha pendente: detalhe da ficha e revisão do montador, com motivo obrigatório (≥ 5 caracteres).
- Devolução (`docs/DEVOLUCAO-DESENHO-20261109.md`): só fichas entregues (`DELIVERED`/`LEGACY_ISSUED`); registro novo, somente acréscimo, com motivo M.D. por item (legenda do modelo; código 12 não é aceito), destino por item ("volta ao estoque" soma ao saldo físico; "descarte/avaria" não muda saldo) e assinatura presencial com evidência. Não altera o snapshot. PDF/XLSX mostram as devoluções na cópia para impressão.
- Desligamento: ao preencher a data no cadastro, a tela oferece a devolução demissional da última ficha assinada e entregue (motivo 13).
- Revisões pendentes podem ser retomadas; alterações de uma revisão preparada devem cancelar/liberar explicitamente a reserva/link antigos antes de iniciar outro rascunho.

### Estoque e catálogo

- O fluxo vigente não tem lotes: saldo, reserva e movimento vinculam-se a equipamento/tamanho (variante). Registros históricos de lotes são mantidos para auditoria e não alimentam novos fluxos.
- Cada equipamento tem uma grade de tamanhos marcados no cadastro (`PUT /products/:id/sizes`, `sync_product_sizes`). Tamanho com saldo, reserva ou histórico não é removido: fica inativo (`variants.active=false`) e não entra em novas fichas nem recebe entrada.
- Movimentação manual (`move_inventory`): entrada, retirada fora de ficha (`WITHDRAWAL`) e ajuste exigem justificativa de 5 a 300 caracteres; devoluções geram `RETURN`.
- C.A.: base pública CAEPI importada por comando em `ca_registry` e consultada por `GET /api/ca/:numero`; a consulta preenche o cadastro, mas nunca o bloqueia. Alertas de validade em 30, 15 e 7 dias e vencido (`contracts/ca-alerts.mts`), sempre com texto.
- Clientes, unidades de trabalho e RACs são listas gerenciadas (migration 011). Nada disso é fixo no código. Kits de EPI por cliente e função (ADMIN/RH) pré-marcam itens no montador; o operador escolhe o tamanho e o kit não muda o snapshot.
- O montador de fichas só lista equipamentos após pesquisa, filtro ou "Ver todos"; voltar para "Todas as categorias" limpa o tamanho dependente.
- Tamanhos válidos para novos cadastros: `Único`, `PP`, `P`, `M`, `G`, `GG`, `XG`, `XGG`, `XXG`, `XXXG` e inteiros `1` a `70`, sem zeros à esquerda. A regra compartilhada está em `contracts/equipment-sizes.mts`; migration 009 espelha a constraint.
- Descrição, C.A., marca e risco vêm do catálogo, sem sobrescrita na emissão.
- Quantidade vencida/avariada de lotes legados permanece bloqueada; não libere automaticamente saldo histórico.

### Documentos e biometria

- Novas fichas usam `COMPANY_EPI_2026_V4`, implementado nos serviços `company-form.service.ts` e `company-document.service.ts`; formatos PDF e XLSX devem manter os dados coerentes. O documento congelado continua histórico.
- Data de emissão é automática em `America/Sao_Paulo`; a data de entrega pode ser ajustada por item. Isso não confirma a entrega.
- O cadastro facial está desabilitado: há somente um contrato futuro 1:1 com prova de vida; não coletar nem inferir dados biométricos.
- O modo de demonstração usa dados fictícios e exportações marcadas sem validade jurídica.

## Arquitetura e limites de confiança

- A API é Express 5, TypeScript ESM, Zod, Supabase JS, PDF-Lib/ExcelJS e Nodemailer. Entrada local: `Backend/src/server.ts`; entrada serverless: `Backend/api/index.ts`.
- A API valida JWT via Supabase Auth e confere organização/perfil em cada operação. `service_role`, `TOKEN_PEPPER` e segredos SMTP são somente backend. Nunca os exponha em runtime config ou bundle do frontend.
- RLS isola organizações e dados. O cliente não deve mutar perfil ou estoque diretamente; use operações transacionais autorizadas.
- Backend sem estado de negócio em memória: sessões, saldos, tokens e rate limits persistem em Supabase/Postgres para funcionar em serverless.
- FaceMatch não está disponível sem provedor; não simular aprovação em ambiente real.
- OpenAPI tem fonte em `Backend/src/openapi.ts` e configuração associada em `Backend/src/config/openapi.ts`; `docs/openapi.json` é gerado.

## Banco e migrations

As migrations atuais são `database/supabase/migrations/001_...sql` até `013_signer_identity_check.sql`, em ordem. 010 a 013 vieram da reunião de validação de 09/11/2026 (resumo em `docs/RELATORIO-REUNIAO-20261109.md`). `database/setup.sql` é artefato consolidado para banco novo e não é migration adicional.

- Banco novo: escolha migrations em ordem **ou** `setup.sql`; nunca execute ambos.
- Banco existente: aplique somente migrations pendentes, em ordem, depois de verificar o histórico instalado.
- Não execute `setup.sql` sobre uma instalação existente; ele deve recusar esquemas ERP já presentes.
- Antes de aplicar 009 a um banco existente em 008, confira tamanhos legados seguindo `database/README.md`; a constraint rejeita valores desconhecidos em vez de convertê-los silenciosamente.
- Após migration nova, atualize o índice em `database/README.md`, regenere `setup.sql` e valide `npm run db:check`.
- Testes SQL usam PGlite/PostgreSQL WASM e contratos mínimos locais para Auth/Storage. Eles não provam a integração com Supabase hospedado, PostgREST, SMTP ou Storage real.

## Configuração e publicação

`.env.example` contém exemplos que não são credenciais válidas. `APP_MODE=demo` e `API_BASE_URL` podem ir para a configuração pública do frontend. Chaves Supabase secret/service role, `TOKEN_PEPPER`, SMTP e `CRON_SECRET` são segredos do backend. Configure origens CORS exatamente; `APP_ORIGIN` deve corresponder à origem do frontend.

Há dois projetos Vercel no mesmo repositório: root directory `Frontend` e `Backend`. O frontend pode ser publicado sozinho em demo; para modo real, configure também a API e serviços Supabase. Builds locais não publicam nada. Não declarar integração hospedada validada sem executar validação nesse ambiente.

## Documentação e precedência

Use esta ordem para resolver discrepâncias:

1. Código, contratos compartilhados e migrations vigentes.
2. `README.md`, `database/README.md` e `docs/ARCHITECTURE.md`.
3. Relatórios datados em `docs/`, que explicam como e por que o estado evoluiu.

Os relatórios antigos podem descrever contagem de migrations, fluxo de assinatura, modelo de documento e resultados de testes que já foram substituídos. Em particular, `docs/VALIDATION.md`, `docs/NO-LOTS-COMPANY-MODEL.md` e `docs/MIGRATION-RENUMBERING.md` contêm seções históricas; para o estado atual use o índice 001–013 de `database/README.md` e o código. Não copie um resultado histórico de testes como se tivesse sido executado nesta alteração.

## Cuidados ao modificar

- Preserve matrículas como texto, sem remover zeros à esquerda.
- Preserve snapshots, hashes, evidências e fichas emitidas; mudanças documentais devem criar versão/fluxo novo, não reescrever histórico.
- Mantenha a mesma regra de domínio no modo real, demo, API, contrato e constraint SQL quando aplicável.
- Não misture assinatura com confirmação de recebimento ou baixa física.
- Trate status, cancelamentos, idempotência e isolamento por organização em todas as camadas envolvidas.
- Não inclua dados reais, segredos ou credenciais nos seeds, logs e documentação.
- Ao alterar modelo PDF/XLSX, confira a saída dos dois formatos e atualize os testes/asset README relacionados.
- Faça mudanças pequenas e localizadas nos templates e estilos; o tema visual usa tokens e CSS compartilhado.

## Referências principais

- `README.md`: instalação, rotas, regras detalhadas, Vercel e troubleshooting.
- `docs/ARCHITECTURE.md`: decisões de arquitetura e limites de integração.
- `docs/VALIDATION.md`: histórico de validações e limitações.
- `database/README.md`: ordem das migrations, instalação e modelo de dados.
- `Backend/src/assets/README.md`: origem e reconstrução dos assets da ficha corporativa.
- `docs/SIGNATURE-CONSENT.md`: texto/consentimento e desenho da assinatura eletrônica.
- `docs/BACK-NAVIGATION-20261022.md` e `docs/REVIEW-SIGNING-20261022.md`: navegação do assistente e assinatura na revisão.
