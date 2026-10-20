# EPI System

ERP de gestão de EPIs em Angular, Express/TypeScript e Supabase. O clone local permanece em `C:\\Dev\\EPI-ERP`; o repositório oficial escolhido é [TechHero-bit/EPI-System](https://github.com/TechHero-bit/EPI-System).

## Experimentar no Windows

Requisitos: Node.js 24.15+ e npm. A demonstração não precisa de Supabase, SMTP ou senhas.

```powershell
Set-Location C:\\Dev\\EPI-ERP
npm ci
npm run dev:web
```

Abra http://localhost:4200 e clique em **Entrar na demonstração**. Escolha ADMIN, ALMOXARIFADO, RH ou SEGURANCA_TRABALHO. Existem 10 colaboradores fictícios, 8 equipamentos nas quatro categorias, estoques variados e fichas em diferentes estados. Os dados ficam no navegador; Administração permite restaurá-los. Todas as exportações demonstrativas são marcadas sem validade jurídica. Nenhuma mensagem ou biometria é enviada.

## Organização

```text
frontend/
  src/app/
    core/                  sessão, permissões, API e repositório demonstrativo
    layouts/               navegação e estrutura responsiva
    components/            componentes compartilhados
    features/              auth, dashboard, almoxarifado, colaboradores,
                           fichas-epi, assinaturas, relatorios, administracao
    shared/                documentos demonstrativos PDF/Excel
  e2e/                     testes no navegador
  tests/                   testes das regras demonstrativas
  vercel.json
backend/
  api/index.ts             entrada serverless Express
  src/                     API, validação, documentos, segurança
  src/modules/face-match/  contrato de integração facial 1:1
  tests/                   testes HTTP
  vercel.json
database/
  supabase/migrations/     fonte única das migrations
  supabase/config.toml     Supabase CLI local
  supabase/seed.sql        dados fictícios opcionais
  setup.sql                instalação consolidada em projeto NOVO
  functions/               provisionamento restrito
  schemas/validate.sql     inspeção pós-instalação
  policies/                decisões de acesso
  tests/                   PostgreSQL/PLpgSQL/RLS em PGlite
  scripts/                 geração mecânica do setup.sql
.github/workflows/ci.yml
package.json               npm workspaces
.env.example
README.md
```

Não há `api/` na raiz. `backend/api/` contém o adaptador Vercel. `dist/`, `node_modules/` e caches são artefatos locais ignorados pelo Git.

## Rotas disponíveis

Login: `/login`. Principal: `/dashboard`. Estoque: `/almoxarifado`, `/almoxarifado/equipamentos`, `/almoxarifado/equipamentos/novo`, `/almoxarifado/estoque`, `/almoxarifado/movimentacoes`. RH: `/rh`, `/rh/colaboradores`, `/rh/colaboradores/novo`, `/rh/fichas`, `/rh/fichas/nova`, `/rh/fichas/:id`, `/rh/assinaturas`. Externa: `/assinar/:token`. Também: `/relatorios` e `/administracao`.

O assistente seleciona colaborador, cartões e tamanhos, permite escolher o lote e revisar a ficha. Cada linha contém exatamente **1 unidade**, sem campo de quantidade editável. As páginas de fichas consultam alterações a cada 15 segundos.

## Modo real

1. Crie um projeto Supabase de desenvolvimento e instale o banco conforme [database/README.md](database/README.md). Não execute o setup completo em um banco que já possui o ERP.
2. Crie a conta do administrador em Supabase Auth e use `database/functions/provision-first-admin.sql`. Para contas posteriores, use `provision-member.sql`. Os scripts exigem UUIDs explícitos e não criam senhas.
3. Copie `.env.example` para `.env`. Preencha as chaves do projeto de desenvolvimento e use `APP_MODE=real`. Gere TOKEN_PEPPER e CRON_SECRET aleatórios com ao menos 32 caracteres. Os exemplos não são segredos utilizáveis.
4. Configure SMTP para verificar o e-mail pessoal e assinar por link. No Supabase Auth, configure as URLs de recuperação, limite de tentativas e política de sessões.
5. Execute os dois processos em terminais separados:

```powershell
npm run dev:api
npm run dev:web
```

Frontend: http://localhost:4200. API: http://localhost:3000/api/health. OpenAPI: http://localhost:3000/api/openapi.json. No modo real, falhas de configuração são exibidas; não existe troca automática para dados fictícios.

Os scripts leem o arquivo da raiz e, se houver, o `.env` do workspace. Variáveis públicas do frontend: somente APP_MODE e API_BASE_URL. A chave service role, TOKEN_PEPPER e SMTP pertencem exclusivamente ao backend.

## Regras do fluxo

- Emissão: documento imutável e reserva transacional, sem baixar estoque físico.
- Assinatura eletrônica: token de 256 bits armazenado como HMAC, 24 horas de validade, OTP de 6 dígitos por e-mail verificado, 10 minutos e até cinco tentativas. O colaborador visualiza o PDF exato antes do aceite. O canal é vinculado ao link e uma mudança invalida sua utilização.
- Entrega: operador confirma o recebimento presencial em ação independente; a transação baixa uma unidade por linha e consome as reservas uma única vez.
- Cancelamento: libera as reservas pendentes e invalida links. Fichas antigas que já baixaram estoque permanecem identificadas como LEGACY_ISSUED para evitar nova baixa.
- Presencial: impressão, registro do operador e local de arquivo; PDF digitalizado de até 5 MB pode ser anexado em bucket privado.
- O cadastro facial é opcional. Nenhum dado biométrico é coletado; o endpoint informa indisponibilidade. Existe contrato 1:1 com prova de vida para integração futura.
- RLS isola organizações e dados de RH. O cliente não altera perfis nem estoque diretamente. A API valida o JWT com Supabase Auth e confere permissões em cada operação.
- CPF só é retornado ao RH, Segurança ou Administração. Documentos e anexos permanecem em buckets privados. Evidências de assinatura são imutáveis; IP/agente têm rotina de retenção.

O modelo documental é **provisório** até receber o PDF original marcado. Rubrica individual por linha, data de devolução e M.D. não aparecem. Os campos amarelos exatos ainda precisam ser conferidos no documento fonte. A data indicada pelo RH é prevista; a entrega efetiva fica na evidência separada. A titularidade do e-mail exige conferência organizacional independente. Assinatura eletrônica simples não é apresentada como avançada ou qualificada.

## Verificações

```powershell
npm run typecheck
npm test
npm run db:check
npm run build
npx playwright install chromium
npm run test:browser
```

`npm test` executa testes HTTP/documentos, regras demonstrativas e SQL real em PostgreSQL WASM (PGlite), com contratos locais mínimos Auth/Storage. Não conecta a banco remoto nem substitui testes com os serviços Supabase hospedados. A suíte de navegador cobre as rotas, perfis, busca, montagem, exportações e assinatura demonstrativa. Resultados e limites estão em [docs/VALIDATION.md](docs/VALIDATION.md).

Após alterar migrations, execute `npm run db:setup` para atualizar o SQL consolidado. O CI verifica que os dois formatos correspondem.

## Vercel: dois projetos no mesmo GitHub

Importe **TechHero-bit/EPI-System** duas vezes e selecione a branch `main`:

| Projeto | Root Directory | Build | Output | Variáveis |
|---|---|---|---|---|
| epi-system-frontend | frontend | npm run build | dist/web/browser | APP_MODE=demo ou real; API_BASE_URL no modo real |
| epi-system-backend | backend | npm run build | gerenciado por Functions | Supabase, APP_ORIGIN, TOKEN_PEPPER, SMTP, CRON_SECRET |

Mantenha habilitada a inclusão de arquivos externos à Root Directory para o npm workspace e seu lockfile na raiz. O frontend usa fallback SPA para acesso direto às rotas. O backend encaminha `/api/*` ao Express e não mantém estado de negócio em memória. Use Node.js 24.x e configure APP_ORIGIN com a URL exata do frontend. API_BASE_URL deve ser a URL HTTPS do backend, sem `/api` no fim.

Para testar apenas a interface na Vercel, publique o frontend com APP_MODE=demo; não precisa configurar o backend. Para o modo real, aplique o banco no projeto de desenvolvimento, configure ambos os projetos e teste health, login, reserva e entrega. O cron diário remove IP/agente após IP_RETENTION_DAYS. A infraestrutura Vercel/Supabase hospedada não é provisionada por scripts de build.

## Erros comuns

- Tela em modo real sem configuração: confira APP_MODE e o backend; para explorar sem serviços, use demo e reinicie o frontend.
- Erro CORS: APP_ORIGIN precisa coincidir exatamente com a origem HTTPS do frontend. API_BASE_URL é configurada no build.
- Sem acesso à organização: crie o vínculo em memberships usando o provisionamento restrito.
- Ficha sem disponibilidade: confira reservas, validade, conservação e tamanho; assinatura pendente não libera reserva automaticamente.
- Envio indisponível: confira SMTP e e-mail previamente verificado. O modo real nunca mostra um OTP fictício.
- Docker indisponível: o modo demo e os testes PGlite funcionam sem Docker. A stack Supabase local completa exige Docker ativo.

## Limites da entrega

Integrações remotas dependem de credenciais não presentes neste clone. O FaceMatch real exige provedor, prova de vida e avaliação de proteção de dados antes da ativação. O PDF original é necessário para validar o modelo definitivo. Categorias, fornecedores, departamentos e cargos são valores textuais nesta primeira versão; não há tabelas de referência artificiais sem integração. A fotografia aceita URL HTTPS; upload de fotografia ao Storage e edição de modelos pela administração ficam para evolução posterior.
