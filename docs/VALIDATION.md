# Validação local

## Atualização de 21/10/2026 — campos e organização

Diretório de trabalho: `C:\Dev\EPI-System`. Estrutura comparada, somente por leitura, com `C:\Dev\GestaoDeChamados`. Backup anterior à mudança: `C:\Users\kevindesouza\.codex\visualizations\2026\10\20\01a159cb-1307-7a03-8c3c-881314ab5367\EPI-System-before-fields-reorganization-20261021.tar` (código, configurações e Git; dependências/caches regeneráveis excluídos).

Separados Backend/Frontend, controllers/routes/schemas/services/middlewares, guards/services/models, páginas TypeScript e HTML. Um único gerador produz PDF e Excel na API e na demonstração. O Nº de Registro pertence à ficha (sequência por organização, idempotente), não à matrícula. Os campos do modelo, as datas de entrega editáveis e a geração automática em America/Sao_Paulo têm testes específicos.

PDF de amostra renderizado com Poppler e Excel importado/renderizado com o motor de planilhas. Inspeção visual dos campos, datas, grade, rodapé de demonstração e ausência das colunas removidas; datas/quantidade/tipos e códigos com zeros são também conferidos com ExcelJS. Descrições longas geram paginação PDF e linhas Excel com altura expandida.

Comandos: `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build`, `npm run db:check`. Os números e resultados finais estão no relatório de reestruturação desta data. A suíte Chromium precisou de encerramento autorizado do próprio servidor de teste na porta 4211, pois o sandbox do Windows bloqueou a limpeza automática; os nove cenários concluíram e o processo retornou código 0. Nenhum servidor de outro projeto foi encerrado.

Sem integração remota: a nova migration foi testada em PostgreSQL PGlite, não aplicada no Supabase hospedado. Auth/Storage/SMTP hospedados e Vercel continuam pendentes de credenciais/autorização. A imagem foi usada como referência de campos; não foi fornecido o arquivo Excel original, logotipo ou texto corporativo editável para conferência de fidelidade exata. Não houve push/deploy/PR.

## Histórico de 20/10/2026

## Atualização de interface na nova pasta

O projeto passou a ser trabalhado em `C:\Dev\EPI-System`. O clone existente nessa pasta continha apenas a licença; a implementação anterior foi incorporada por fast-forward dos commits locais, preservando o histórico e sem push. O estado inicial do novo clone foi salvo em `C:\Users\kevindesouza\.codex\visualizations\2026\10\20\01a159cb-1307-7a03-8c3c-881314ab5367\EPI-System-before-ui-changes.tar`.

Nesta atualização: login demonstrativo somente com RH e Almoxarifado; um Dashboard no menu com conteúdo específico de cada setor; assinaturas acessíveis como filtro das fichas; remoção dos campos de fotografia e prazo de utilização do cadastro; seleção de categoria com cadastro de novos nomes; cartões sem emotes ou espaços vazios de imagem. Dados antigos desses campos foram preservados.

Validação no novo caminho: `npm run typecheck` e `npm run build` aprovados; 24 testes existentes aprovados e 7 testes Chromium aprovados (31 ao todo). Foi repetido o teste demonstrativo após acrescentar a verificação de preservação dos metadados antigos na edição. Capturas de desktop e celular foram conferidas. A suíte de navegador usa a porta 4211 e não reutiliza servidor de outra pasta.

O restante deste relatório documenta a implementação anterior e seus limites de infraestrutura, que continuam aplicáveis.

Projeto: `C:\Dev\EPI-ERP`. Node.js 24.15.0, Windows/PowerShell. Repositório oficial selecionado pelo usuário: TechHero-bit/EPI-System. O origin local foi atualizado após consulta do repositório; seu histórico inicial contém a licença.

## Resultados executados

| Comando              | Resultado                                                                  |
| -------------------- | -------------------------------------------------------------------------- |
| npm run typecheck    | Backend e frontend aprovados                                               |
| npm test             | 24 testes aprovados: 6 Backend/HTTP/documentos, 6 demonstração, 12 SQL/RLS |
| npm run test:browser | 4 testes Chromium aprovados                                                |
| npm run build        | Angular e TypeScript aprovados                                             |
| npm run db:check     | SQL consolidado corresponde às migrations                                  |
| git diff --check     | Sem erros de whitespace                                                    |

O navegador abriu diretamente as 15 páginas internas pedidas e validou refresh, login demonstrativo, montagem com dois EPIs, download PDF e Excel, assinatura externa simulada, separação da entrega, perfil ALMOXARIFADO, busca e viewport móvel. A suíte detecta erros JavaScript nas páginas. O limite inicial de 30 segundos para a sequência inteira de navegação foi insuficiente em compilação local fria; o prazo dessa suíte foi ajustado e a nova execução passou.

O backend validou ausência de sessão, CORS, health público, JSON de erro e geração de documentos. Os documentos são de modelo provisório; o Excel e o PDF demonstrativos são identificados como fictícios.

## Banco

As migrations e o setup consolidado foram executados em bancos PostgreSQL PGlite limpos. Os testes usam contratos mínimos locais para auth.users, auth.uid(), papéis e storage.buckets; executam as funções PLpgSQL e políticas RLS reais do projeto. Verificam instalação duplicada recusada, seed idempotente, entrada idempotente, perfis, isolamento entre organizações, quantidade fixa 1, bloqueio de saldo negativo, reserva de múltiplos itens, cancelamento, imutabilidade, OTP, expiração, uso único, evidências, registro presencial, baixa física única e proteção de perfil.

Não foram executadas migrations em banco remoto. A stack Supabase completa não foi iniciada porque o Docker não estava ativo. Testes locais não substituem integração com Auth/Storage/PostgREST hospedados, SMTP real ou concorrência entre múltiplas conexões de uma instalação Supabase.

## Implementado e verificável localmente

- Frontend navegável nas rotas solicitadas, com menus por perfil, busca, filtros, formulários, assistente de fichas e layout responsivo.
- Modo demonstração sem API externa, com 10 colaboradores, quatro categorias, estados variados, exportações e assinatura explicitamente simulada.
- API com JWT/RBAC, cadastro e edição, reserva/entrada/ajuste/cancelamento/entrega transacionais, geração de documentos, link+OTP, trilha de auditoria, anexo presencial privado e perfis administrativos.
- Instalação Supabase por migrations ou SQL consolidado, seeds sem senhas, provisionamento restrito, RLS e buckets privados.
- Configurações separadas para os projetos Vercel frontend e backend, runtime config e health check.

## Limites e pendências externas

- Não há arquivos .env reais nem credenciais Supabase/SMTP neste clone. Login real, entrega de mensagens, arquivos nos buckets e assinatura real precisam de validação ponta a ponta no ambiente de desenvolvimento.
- Não há projeto Vercel vinculado nem credenciais de deploy configuradas. Configurações e procedimento estão preparados; nenhuma URL de deploy é declarada como publicada.
- FaceMatch está indisponível, com contrato 1:1 preparado. Não coleta nem aprova biometria; depende de provedor com prova de vida e avaliação de proteção de dados.
- O PDF original marcado não foi fornecido. Os campos removidos conhecidos não aparecem; o modelo definitivo e os campos amarelos exatos ainda precisam ser conferidos.
- A data efetiva de entrega e o histórico são evidências separadas do PDF imutável. Upload de fotografia ao Storage, personalização administrativa de modelos e tabelas normalizadas de departamentos/cargos/categorias/fornecedores ficam para evolução posterior; nesta versão usam-se fotografia por URL HTTPS e campos textuais.

## Backup

Backup verificável de código, arquivos de configuração e histórico Git: `C:\Users\kevindesouza\Documents\Codex\2026-10-20\EPI-ERP-code-and-git-backup.tar`. A listagem foi conferida para .git/HEAD, Backend/src/app.ts e package-lock.json. O backup anterior EPI-ERP-backup-20261020.zip também foi preservado. node_modules, dist e caches regeneráveis não fazem parte do TAR de código; uma tentativa de arquivar dependências encontrou arquivo bloqueado. Dependências são reconstituídas por npm ci.

Os arquivos TypeScript, Angular, CSS e configurações foram formatados para revisão. A remoção dos componentes Angular antigos e a movimentação das migrations são recuperáveis pelo Git e pelos backups.

## Git e publicação

Commits locais desta entrega: `f918c28` (implementação, migrations e testes) e `a85984a` (integração dos históricos na main, preservando a licença oficial do EPI-System). O clone permanece no caminho original e o origin é `https://github.com/TechHero-bit/EPI-System.git`. Não foi criado repositório, fork ou Pull Request.

A conta do conector GitHub tem somente leitura. A credencial Git do Windows passou no dry-run de push; porém a revisão automática bloqueou o push efetivo por exigir autorização explícita adicional diante da proibição anterior de publicar sem autorização. Nenhum commit foi publicado. A main local permanece à frente de origin/main; o envio depende dessa autorização. Nenhum deploy Vercel ou SQL remoto foi executado.
