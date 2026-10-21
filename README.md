# EPI System

ERP de gestão de EPIs em Angular, Express/TypeScript e Supabase. O projeto local está em `C:\Dev\EPI-System`; o repositório oficial escolhido é [TechHero-bit/EPI-System](https://github.com/TechHero-bit/EPI-System).

## Experimentar no Windows

Requisitos: Node.js 24.15+ e npm. A demonstração não precisa de Supabase, SMTP ou senhas.

```powershell
Set-Location C:\Dev\EPI-System
npm ci
npm run dev:web
```

Abra http://localhost:4200 e clique em **Entrar na demonstração**. Escolha RH ou Almoxarifado. Cada setor possui seu próprio Dashboard. Existem 10 colaboradores fictícios, 8 equipamentos nas quatro categorias, estoques variados e fichas em diferentes estados. Os dados ficam somente no navegador. Todas as exportações demonstrativas são marcadas sem validade jurídica. Nenhuma mensagem ou biometria é enviada.

## Organização

```text
Frontend/
  src/app/
    core/models/           contratos e modelos
    core/services/         sessão, API e repositório demonstrativo
    core/guards/           proteção das rotas por perfil
    layout/app-shell/      navegação e estrutura responsiva
    shared/components/     componentes compartilhados
    shared/utils/          ordenação e adaptação documental da demonstração
    features/*/pages/*/    páginas .page.ts com templates .page.html separados
  e2e/                     testes no navegador
  test/                    testes das regras demonstrativas
  vercel.json
Backend/
  api/index.ts             entrada serverless Express
  src/config/              ambiente e OpenAPI
  src/routes/              rotas por domínio
  src/controllers/         tratamento HTTP por domínio
  src/schemas/             validação de entradas
  src/services/            documentos, segurança, acesso e persistência
  src/middlewares/         erros e limitação de requisições
  src/modules/face-match/  contrato de integração facial 1:1
  test/                    testes HTTP e serviços
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

Não há `api/` na raiz. `Backend/api/` contém o adaptador Vercel. `dist/`, `node_modules/` e caches são artefatos locais ignorados pelo Git.

## Rotas disponíveis

Login: `/login`. Principal: `/dashboard`. Estoque: `/almoxarifado`, `/almoxarifado/equipamentos`, `/almoxarifado/equipamentos/novo`, `/almoxarifado/estoque`, `/almoxarifado/movimentacoes`. RH: `/rh`, `/rh/colaboradores`, `/rh/colaboradores/novo`, `/rh/fichas`, `/rh/fichas/nova`, `/rh/fichas/:id`, `/rh/assinaturas`. Externa: `/assinar/:token`. Também: `/relatorios` e `/administracao`.

O assistente seleciona colaborador, cartões e tamanhos, permite escolher o lote e revisar a ficha. Cada linha contém exatamente **1 unidade**, sem campo de quantidade editável. As páginas de fichas consultam alterações a cada 15 segundos.

O menu contém apenas um Dashboard, adaptado ao setor. Os endereços antigos `/rh` e `/almoxarifado` redirecionam para ele. Assinaturas são consultadas pelo filtro em Fichas de EPI; `/rh/assinaturas` redireciona para a lista filtrada por pendentes. O catálogo não usa emotes nem área de fotografia. No cadastro, a categoria é uma seleção com opção de adicionar um novo nome; fotografia e prazo de utilização não são solicitados.

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

O PDF e o Excel usam o mesmo gerador portátil em `Backend/src/services/document.service.ts`, importado também pela demonstração. Os campos seguem a imagem fornecida: funcionário, função, admissão, demissão, registro da ficha e tabela de data da entrega, quantidade 1, descrição, C.A., marca e risco. Tamanho/lote continuam na rastreabilidade, fora da tabela impressa. Rubrica por linha, devolução e M.D. não aparecem. A reprodução não inclui a assinatura nem dados pessoais da foto; o arquivo Excel original ainda é necessário para validar fidelidade exata, logotipo e texto corporativo.

A data de geração é automática na emissão (America/Sao_Paulo) e fica congelada no documento; a data da entrega é editável, com padrão geral e ajuste por item. Isso não confirma o recebimento físico, que continua exigindo uma ação separada. O Nº de Registro cresce por ficha e organização, com alocação transacional e repetição idempotente; números reservados em falhas/cancelamentos não são reutilizados e podem deixar lacunas. A matrícula do funcionário é outro campo. Documentos históricos assinados não são reescritos nem recebem numeração retroativa. Em banco existente, aplique somente a nova migration `202610210001_sheet_register.sql` (não o setup integral).

A organização de diretórios acompanha `C:\Dev\GestaoDeChamados`, preservando TypeScript e Supabase. As pastas agora são `Backend/` e `Frontend/`, inclusive em sistemas sensíveis a maiúsculas. Atualize os Root Directories da Vercel para esses nomes e habilite a inclusão de arquivos fora da raiz do projeto no frontend para o gerador compartilhado. Nenhum deploy é feito pelos comandos locais. A titularidade do e-mail exige conferência organizacional independente. Assinatura eletrônica simples não é apresentada como avançada ou qualificada.

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

| Projeto             | Root Directory | Build         | Output                   | Variáveis                                             |
| ------------------- | -------------- | ------------- | ------------------------ | ----------------------------------------------------- |
| epi-system-frontend | frontend       | npm run build | dist/web/browser         | APP_MODE=demo ou real; API_BASE_URL no modo real      |
| epi-system-backend  | backend        | npm run build | gerenciado por Functions | Supabase, APP_ORIGIN, TOKEN_PEPPER, SMTP, CRON_SECRET |

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

Integrações remotas dependem de credenciais não presentes neste clone. O FaceMatch real exige provedor, prova de vida e avaliação de proteção de dados antes da ativação. O PDF original é necessário para validar o modelo definitivo. Categorias, fornecedores, departamentos e cargos são valores textuais nesta primeira versão; não há tabelas de referência artificiais sem integração. Fotografia e prazo de utilização foram retirados do cadastro simplificado. Validade do CA e validade de lote são mantidas separadamente.
