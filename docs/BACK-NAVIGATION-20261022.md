# Voltar nas etapas de montagem da ficha

## Comportamento

- Etapa 1: Voltar retorna à lista de fichas.
- Etapa 2: Voltar retorna ao colaborador, mantendo a seleção e as datas dos EPIs.
- Etapa 3 antes de preparar: Voltar retorna aos equipamentos, mantendo colaborador, datas, método e seleção.
- Etapa 3 já preparada, ainda pendente de assinatura/entrega: Voltar pede confirmação. Ao confirmar, a reserva anterior é cancelada/liberada, o link deixa de funcionar e um novo rascunho é preenchido com os mesmos dados. A emissão seguinte usa outra chave de idempotência e cria outra versão, sem reescrever o documento anterior. “Alterar método ou dados” executa o mesmo fluxo, permanecendo na revisão para permitir a troca imediata da opção de assinatura.
- Etapa 4: Voltar à revisão reabre a versão consultada. Fichas assinadas ou entregues podem ser revisitadas nas etapas anteriores apenas em modo de consulta: colaborador, seleção, datas e método permanecem bloqueados, sem cancelar a reserva ou remover a assinatura.
- Cancelar a confirmação (“Manter revisão atual”) não altera a versão nem libera a reserva.

Há controle Voltar no topo e junto às ações de cada etapa, incluindo antes de gerar. O menu de etapas usa a mesma proteção de retorno; não libera a edição de um PDF já preparado. Dados de equipamento continuam vindo exclusivamente do Almoxarifado. A quantidade permanece 1 por linha, Nº de Registro continua sendo a matrícula e assinatura não confirma entrega física.

## Preservação e concorrência

O rascunho recupera variante e datas do snapshot/vínculos da versão preparada, sem copiar campos de equipamento como possíveis overrides. A recuperação é validada antes de cancelar qualquer reserva; em caso de dados incompletos, a versão existente é preservada e um erro é exibido.

Antes de confirmar o retorno, o estado é consultado novamente. Se a ficha já estiver assinada/entregue, o retorno passa a ser somente consulta. As operações usam o cancelamento transacional/auditado já existente; não foi criada uma migration nova. Se uma assinatura for registrada entre a consulta e o cancelamento, o snapshot/assinatura permanecem preservados, a reserva fica cancelada conforme a operação já confirmada e a interface informa o ocorrido sem abrir edição dessa versão.

Na demonstração, o motivo do cancelamento também é registrado e os tokens antigos são consumidos. As regras do ambiente real continuam no backend e PostgreSQL. Não houve acesso a banco remoto, push ou deploy.

## Arquivos

- `Frontend/src/app/features/fichas-epi/pages/builder/`: navegação, confirmação e novo rascunho.
- `Frontend/src/app/features/fichas-epi/pages/detail/detail.page.html`: retorno da ficha final para revisão.
- `Frontend/src/app/shared/utils/review-draft.ts`: recuperação validada dos dados.
- `Frontend/src/app/core/services/`: motivo/auditoria e invalidação de link no cancelamento demo.
- `Frontend/test/review-draft.test.ts`: recuperação, rejeição de dados inválidos, liberação de reserva e preservação do snapshot.
- `Frontend/e2e/back.spec.ts`: retorno entre etapas, alteração de método, cancelamento da confirmação, link antigo inválido e consulta de ficha assinada.

## Validação

`npm test`: 47 testes aprovados (13 API/documentos, 15 demonstração/rascunho, 19 SQL/RLS). `npm run test:browser`: 14 cenários Chromium aprovados, incluindo os dois novos fluxos de retorno e as regressões de assinatura, catálogo e exportação. Total: 61 testes. A confirmação de retorno também foi conferida em captura de celular.

`npm run typecheck`, `npm run build` e `npm run db:check` concluíram com código 0. Permanecem os avisos CommonJS de QR Code já documentados na entrega anterior; não são falhas de build.

Os testes usam demonstração e PostgreSQL local PGlite; não validam serviços Supabase/SMTP hospedados. Não foram atualizadas dependências nem migrations nesta tarefa. Os limites de infraestrutura e avisos de segurança da entrega anterior continuam descritos em `REVIEW-SIGNING-20261022.md`.

Backup anterior à alteração: `C:\Users\kevindesouza\.codex\visualizations\2026\10\20\01a159cb-1307-7a03-8c3c-881314ab5367\EPI-System-before-back-navigation-20261022.tar` (código, configurações e Git; dependências, caches e builds regeneráveis excluídos).
