# Reestruturação e campos da ficha — 21/10/2026

Implementação em `C:\Dev\EPI-System`, diretamente na `main` local. O diretório `C:\Dev\GestaoDeChamados` foi apenas consultado como referência de organização. Nenhum repositório, fork, PR, push ou deploy foi criado/executado.

## Organização final

```text
EPI-System/
├── Backend/
│   ├── api/index.ts
│   ├── scripts/                 geração OpenAPI e amostras PDF/Excel
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middlewares/
│   │   ├── modules/face-match/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── app.ts
│   │   └── server.ts
│   └── test/
├── Frontend/
│   ├── src/app/
│   │   ├── core/{guards,models,services}/
│   │   ├── layout/app-shell/
│   │   ├── shared/{components,utils}/
│   │   ├── features/*/pages/*/   .page.ts + .page.html
│   │   ├── app.ts + app.html
│   │   ├── app.config.ts
│   │   └── app.routes.ts
│   ├── e2e/
│   └── test/
├── database/supabase/migrations/
├── docs/
├── .github/
├── package.json + package-lock.json
├── .prettierrc.json
├── .gitignore
├── .env.example
└── README.md
```

`dist/`, `node_modules/` e caches continuam locais e ignorados. Não existe `api/` na raiz. Não foram criados `apps/`, `packages/` ou `services/` na raiz. As pastas Backend e Frontend seguem as maiúsculas do projeto de referência; isso deve ser respeitado na Vercel/Linux.

## Arquivos e mudanças principais

- `backend/` → `Backend/`; `frontend/` → `Frontend/`; imports, workspaces, lockfile, scripts e documentação ajustados.
- `Backend/src/app.ts`: composição Express; os endpoints foram separados em `routes/` e `controllers/` de administração, colaboradores, estoque, fichas, assinaturas e sistema. Middleware público de limitação e tratamento de erros separados.
- Configuração/OpenAPI em `Backend/src/config/`; validações de produto/funcionário em `schemas/`; segurança, persistência e documentos em `services/`. Testes movidos para `Backend/test/`.
- Páginas Angular movidas para `Frontend/src/app/features/*/pages/*/`, com HTML separado do TypeScript. Sessão/API/demonstração em `core/services/`, contratos em `core/models/`, permissões em `core/guards/`, estrutura em `layout/` e componentes compartilhados em `shared/components/`.
- `Frontend/src/app/shared/utils/alphabetical.ts`: ordenação pt-BR com acentos e comparação numérica, sem modificar os dados originais. Aplicada a lotes, variações, equipamentos, categorias, funcionários, perfis e opções estáticas. Placeholders e a ação de nova categoria mantêm posição própria.
- `Frontend/src/app/features/fichas-epi/pages/builder/`: revisão com funcionário/função/admissão/demissão; entrega padrão e por linha; descrição, C.A., marca e risco editáveis; quantidade continua fixa em 1.
- `Backend/src/services/document.service.ts`: gerador compartilhado de PDF e Excel; registro da ficha no cabeçalho, geração automática em America/Sao_Paulo, data da entrega por linha, datas reais do Excel, campos e grade da imagem. PDF pagina descrições longas; Excel expande linhas.
- `Frontend/src/app/shared/utils/demo-document.ts`: apenas adaptação de dados para o mesmo gerador, identificado como demonstração.
- `database/supabase/migrations/202610210001_sheet_register.sql`: número sequencial por ficha/organização, reserva transacional idempotente, índice único, validação no banco, auditoria e RLS. Snapshots/PDFs históricos não são reescritos. Números de falhas/cancelamentos não são reutilizados; lacunas são possíveis.
- `database/setup.sql`, OpenAPI, testes, READMEs e instruções de execução atualizados. `.prettierrc.json` reconhece os templates Angular `.page.html`.

## Validação

| Verificação            | Resultado                                |
| ---------------------- | ---------------------------------------- |
| Typecheck              | Backend e Frontend aprovados             |
| Build                  | Angular e API TypeScript aprovados       |
| Backend/API/documentos | 8 testes aprovados                       |
| Demonstração           | 8 testes aprovados                       |
| PostgreSQL/PGlite      | 15 testes aprovados                      |
| Chromium               | 9 testes aprovados                       |
| Total                  | 40 testes aprovados                      |
| SQL consolidado        | Sincronizado com migrations              |
| PDF/Excel de amostra   | Renderizados e inspecionados visualmente |

Os testes incluem sequência por ficha, reenvio idempotente, recusa de número forjado, preservação de fichas anteriores na atualização, filtros ordenados e exportação com datas de geração/entrega diferentes. Não equivalem a testes da infraestrutura Supabase hospedada ou de concorrência entre várias conexões remotas.

Backup anterior às alterações: `C:\Users\kevindesouza\.codex\visualizations\2026\10\20\01a159cb-1307-7a03-8c3c-881314ab5367\EPI-System-before-fields-reorganization-20261021.tar` (fontes, configurações e Git; caches/dependências regeneráveis excluídos). As alterações e movimentações também são recuperáveis pelo Git local.

## Executar no Windows

```powershell
Set-Location C:\Dev\EPI-System
npm ci
npm run dev:web
```

Abra `http://localhost:4200`. Para evitar conflito com o servidor antigo de outro diretório: `npm run start -w @epi/frontend -- --port 4210`, abrindo `http://localhost:4210`. API em outro terminal: `npm run dev:api`. Testes: `npm test`, `npm run test:browser`, `npm run typecheck`, `npm run build` e `npm run db:check`. Amostras fictícias: `npm run documents:preview`, em `dist/document-preview/`.

## Pendências externas

- Aplicar **somente a nova migration** em um Supabase existente que já tenha todas as migrations anteriores. Não executar o setup integral em banco com dados. Nenhuma migration remota foi aplicada nesta tarefa.
- Validar Auth, Storage e SMTP com credenciais de desenvolvimento. FaceMatch continua desabilitado, sem coleta biométrica.
- Atualizar os Root Directories Vercel para `Frontend` e `Backend`; no frontend, habilitar a inclusão de arquivos externos à raiz para o gerador compartilhado. Não foram alterados projetos remotos nem feito deploy.
- Fornecer o Excel original para validação de fidelidade gráfica exata, logotipo e texto corporativo. A implementação usa os campos da imagem, sem copiar assinatura ou dados pessoais dela. Não afirma equivalência jurídica ou fidelidade pixel a pixel.
