# Estoque sem lotes, matrícula e ficha corporativa

Local: `C:\Dev\EPI-System`. Trabalho realizado no repositório original, sem PR, fork, push, deploy ou execução SQL hospedada.

## Regras implementadas

- Sem cadastro ou seleção de lotes. Saldos e movimentações vinculam-se diretamente ao equipamento/tamanho (variante).
- Matrícula manual obrigatória, exclusiva por organização, armazenada como texto. O Nº de Registro de todas as novas fichas do colaborador repete sua matrícula. A versão continua incremental; não há nova sequência de registro por ficha.
- Matrícula, nome, função, admissão e demissão são congelados no snapshot da emissão. Alterar posteriormente o cadastro não reescreve documentos anteriores.
- Quantidade fixa 1 por linha. Data de geração automática em America/Sao_Paulo, entrega editável por item. Assinatura não confirma a entrega nem baixa estoque.
- Modelo real da empresa incorporado ao XLSX e reproduzido no PDF: logotipo, cabeçalho, declaração e riscos. Mantida a remoção das colunas de rubrica por item, devolução e M.D., solicitada anteriormente. Nenhuma assinatura foi simulada.
- Reservas, cancelamento e confirmação física continuam transacionais, idempotentes, autorizados por perfil e auditados.

## Arquivos e estrutura

```text
EPI-System/
  Backend/
    src/assets/company-model.ts          modelo e logo incorporados
    src/assets/README.md                 origem e hash do original
    src/services/company-document.service.ts
    src/controllers/                     bootstrap, estoque e emissão
    src/routes/inventory.routes.ts        /api/inventory/:id/receive e adjust
    src/config/openapi.ts
    test/                                contratos e documentos
    scripts/preview-document.ts
  Frontend/
    src/app/core/                        modelos, estoque e migração demo v2→v3
    src/app/features/almoxarifado/        catálogo, tamanhos e saldos
    src/app/features/colaboradores/       matrícula / Nº de Registro
    src/app/features/fichas-epi/          montagem, consulta e exportações
    src/app/features/dashboard/          indicadores sem lotes
    src/app/layout/app-shell/            menu Estoque
    test/ e e2e/                         fluxo e exportação no navegador
  database/
    supabase/migrations/006_inventory_without_lots.sql
    supabase/seed.sql                    seed atual sem lotes
    schemas/validate.sql
    setup.sql                            consolidado para banco NOVO
    tests/fixtures/legacy-seed.sql        somente testes de atualização
    tests/integration.test.ts
  docs/openapi.json
  README.md
```

Nenhuma pasta foi movida nesta atualização; foi mantida a organização Backend/Frontend da entrega anterior. Os geradores históricos permanecem para leitura/exportação das fichas antigas.

## Preservação e banco

Backup de código, configurações e Git antes das mudanças: `C:\Users\kevindesouza\.codex\visualizations\2026\10\20\01a159cb-1307-7a03-8c3c-881314ab5367\EPI-System-before-no-lots-employee-register.tar`. Dependências, caches e saídas de build regeneráveis foram excluídos. Não foi feito backup de banco remoto, pois nenhum banco remoto foi acessado.

O Excel original em Downloads não foi modificado. Hash e adaptação estão em `Backend/src/assets/README.md`.

A migration consolida saldo físico/reservado por variante, migra movimentos e reservas e mantém vínculos históricos. Unidades não reservadas de antigos lotes vencidos/avariados passam a bloqueadas, sem liberação automática. Não foi implementado um fluxo administrativo de desbloqueio nesta tarefa. Lotes antigos permanecem somente leitura para auditoria; os endpoints antigos retornam 404. Funções antigas de movimentação não são executáveis pelo serviço. Após a renumeração pré-instalação, a função de contador não é mais criada.

O modo demo lê os dados v2, salva uma cópia de segurança no navegador e grava a nova versão em `epi-demo-v3`; não apaga os dados v2. Fichas antigas não recebem matrícula retroativa nem têm seus hashes alterados.

Atualização posterior: o usuário confirmou que nenhuma migration havia sido aplicada. Os arquivos foram renumerados de 001 a 006, removendo a antiga migration de contador e corrigindo as dependências. Banco novo: usar o consolidado ou as seis migrations em ordem, não ambos. Não aplicar os novos nomes sobre um histórico antigo já registrado e nunca executar `setup.sql` sobre banco existente. A aplicação no Supabase hospedado continua pendente de revisão/autorização.

## Execução no Windows

```powershell
Set-Location C:\Dev\EPI-System
npm ci
npm run dev:web
# Em outro terminal, para o modo real configurado:
npm run dev:api
```

Se a porta 4200 já estiver ocupada, use `npm run start -w @epi/frontend -- --port 4210`. Para o modo real, configurar `.env` conforme README e preparar Supabase/Auth/Storage/SMTP. Ausência de credenciais não permite validar esses serviços hospedados.

## Validação

Resultados locais de 21/10/2026:

| Verificação            | Resultado                                                       |
| ---------------------- | --------------------------------------------------------------- |
| `npm test`             | 39 aprovados: 11 API/documentos, 10 demonstração, 18 SQL/RLS    |
| `npm run test:browser` | 11 cenários Chromium aprovados, processo encerrado com código 0 |
| `npm run typecheck`    | Backend e Frontend aprovados                                    |
| `npm run build`        | Angular e TypeScript Backend aprovados                          |
| `npm run db:check`     | Consolidado corresponde às migrations                           |
| `git diff --check`     | Sem erros de whitespace                                         |

Total: 50 testes. Foram verificados cadastro com matrícula `000546`, duas fichas com o mesmo registro, unicidade/zeros no banco e no XLSX, estoque sem lote, separação assinatura/entrega, reserva/cancelamento idempotentes, RLS, bloqueio de saldo histórico e preservação de snapshots/hashes na atualização. Um seletor do novo teste de estoque foi corrigido após timeout; a repetição integral passou. Também foi corrigida e testada a expansão de mesclagens do XLSX para as 15 linhas permitidas.

O PDF normal e as oito páginas de uma amostra de estresse foram renderizados e inspecionados. O Excel normal e a tabela com 15 itens/textos extensos foram renderizados e conferidos; valores, datas tipadas, matrícula textual, imagem e mesclagens da última linha têm asserts. São saídas de teste fictícias em `dist/document-preview/`, ignoradas pelo Git. O original foi conferido por SHA-256 novamente após a implementação e não mudou.

Os testes de banco usam PostgreSQL PGlite com contratos mínimos Auth/Storage: não substituem testes de integração com Supabase hospedado. A conferência visual usa Poppler para PDF e Artifact Tool para XLSX, além de leitura dos valores e tipos com ExcelJS. Não foi realizada homologação no Microsoft Excel desktop nem de assinatura/SMTP/Auth/Storage hospedados. O PDF é uma adaptação do modelo corporativo, não reprodução pixel a pixel.

Foi preservada, sem incluir no commit, a alteração preexistente de `Frontend/angular.json` (analytics). Não houve push, deploy, PR ou alterações em outros projetos.
