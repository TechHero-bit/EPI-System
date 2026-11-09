# Prompt para o agente: alterações pedidas na última reunião

Copie tudo abaixo da linha e envie ao agente.

---

## Papel e objetivo

Você vai implementar, no repositório `C:\Dev\EPI-System`, as alterações pedidas pelas áreas de Almoxarifado, RH e Segurança do Trabalho em uma reunião de validação do sistema. O trabalho está dividido em fases. Termine e valide uma fase antes de começar a próxima.

Não faça deploy, `git push` nem commit. Deixe as mudanças na árvore de trabalho, organizadas por fase, para revisão. Toda a interface e os textos de produto ficam em português do Brasil.

## Leitura obrigatória antes de codar

1. `docs/AGENT-CONTEXT.md` (mapa do projeto e regras de negócio vigentes).
2. `README.md`, `database/README.md`, `docs/ARCHITECTURE.md` e `docs/SIGNATURE-CONSENT.md`.
3. `contracts/equipment-sizes.mts` e `contracts/signature.mts`.

Em caso de divergência entre documentos e código, vale a ordem: código, contratos e migrations; depois README e arquitetura; por último os relatórios datados em `docs/`.

## Regras que não podem ser quebradas

- Ficha emitida é snapshot imutável, com hash e versão. Nunca reescreva fichas, hashes ou evidências existentes. Mudança de documento vale só para fichas novas.
- Assinatura e entrega física são eventos distintos. A assinatura não baixa estoque. A confirmação física consome a reserva uma vez.
- Cada linha da ficha é exatamente uma unidade. Matrícula é texto, e zeros à esquerda são significativos.
- A mesma regra de domínio deve valer no modo real (API e banco), na demonstração, nos contratos e nas constraints SQL. A demonstração não pode chamar API nem serviço externo.
- Autorização real fica na API e no banco (RLS). O perfil `ALMOXARIFADO` não acessa CPF nem documentos pessoais de RH.
- Backend sem estado de negócio em memória: contadores, tokens e limites ficam no Postgres.
- Migrations novas começam em `010_...`, em ordem. Não edite as migrations 001 a 009. Após cada migration, atualize o índice em `database/README.md`, rode `npm run db:setup` e `npm run db:check`.
- Nunca coloque segredos, dados reais de colaboradores ou CPFs reais em código, seeds, logs, testes ou documentação.
- Mudanças pequenas e localizadas. Reaproveite componentes, tokens de tema e CSS compartilhado.
- Se uma tarefa conflitar com estas regras, ou o código já fizer algo diferente do que este prompt descreve, pare naquele ponto, registre a divergência no relatório final e siga a opção mais segura.

## Decisões já tomadas

| Tema | Decisão |
| --- | --- |
| Fonte do CA | Importar a base pública CAEPI e consultar localmente. Verifique o formato e a URL oficiais antes de implementar; não invente. |
| Destino do EPI devolvido | O operador escolhe por item: volta ao estoque ou é baixado como descarte/avaria. |
| PDF antes de assinar | Manter como está: o colaborador vê o documento antes do aceite. |
| Cliente, unidade e RAC | Listas gerenciadas por `ADMIN`. |
| Ficha padrão | Kit de EPIs por cliente e função, entra neste trabalho. |
| Alerta de CA | Níveis 30, 15 e 7 dias, e vencido. |
| Confirmação na assinatura | Nome digitado, 3 primeiros e 3 últimos dígitos do CPF, e o código por e-mail que já existe. Limite de 5 tentativas. |
| CPF de teste | `934.928.540-10` (`93492854010`) em seed, demo e fixtures. Nunca em migration. |
| Tamanhos | O usuário marca, no cadastro do EPI, os tamanhos que existem. Cada tamanho vira uma variante. |
| Ficha de ferramentas | Fora do escopo por enquanto. |

## Fase 0: reconhecimento

1. Rode `npm ci` se necessário e execute a linha de base: `npm run typecheck`, `npm test`, `npm run db:check`. Anote o que já falha antes de qualquer mudança.
2. Verifique o que já existe e relate em poucas linhas: cancelamento de ficha (`POST /sheets/:id/cancel`) e se há tela para ele; qualquer fluxo de devolução; tamanho e estoque lado a lado na tela de equipamentos; filtros de categoria e tamanho no montador de fichas; campo `work_unit`; colunas `cpf` e `ca_expires_at`; o que acontece hoje quando `termination_date` é preenchida.
3. Se algo pedido abaixo já estiver pronto, não refaça: confirme com um teste e siga.

## Fase 1: catálogo, CA e almoxarifado

**1.1 Grade de tamanhos por produto.**
- No cadastro do EPI, o usuário escolhe a grade (letras, números ou `Único`) e marca só os tamanhos que existem, por exemplo bota 38 a 44 ou luva P, M e G.
- Cada tamanho marcado vira uma variante. Use apenas os valores válidos de `contracts/equipment-sizes.mts`.
- Na edição, não permita remover um tamanho que tenha saldo, reserva ou histórico; desative-o.
- Na lista de equipamentos, mostre o estoque disponível ao lado de cada tamanho.

**1.2 CA automático.**
- Backend: serviço que importa a base CAEPI para uma tabela de consulta (número do CA, validade, equipamento, fabricante, situação) e um endpoint de consulta por número, autorizado para `ADMIN`, `ALMOXARIFADO`, `RH` e `SEGURANCA`.
- A importação deve poder rodar por comando (por exemplo `npm run ca:import`) e ser idempotente. Considere o limite de tempo de funções serverless e processe em lotes.
- Frontend: ao digitar o CA no cadastro de EPI, preencher validade e dados do equipamento. Todos os campos continuam editáveis, e a falha da consulta nunca bloqueia o cadastro manual.
- Demonstração: use um pequeno conjunto fictício embutido, sem rede.
- Documente a origem dos dados e a frequência de atualização recomendada.

**1.3 Movimentação.**
- Tela de movimentação no topo da página; o resto do conteúdo (catálogo e listas) vem abaixo.
- Seletor igual ao do dashboard: escolher o EPI e os tamanhos aparecem ao lado, para não cadastrar "Bota 40" e "Bota 42" separadamente.
- Entrada exige quantidade e justificativa. Toda retirada ou ajuste feito fora de uma ficha exige justificativa, tanto para mais quanto para menos. Ajuste o campo "operação" para refletir esses tipos.
- Busca por CA: ao digitar o CA, se o item existir, ele é selecionado e o usuário escolhe tamanho e quantidade; se não existir, aparece um botão para cadastrá-lo ali mesmo, no mesmo fluxo, usando a consulta do item 1.2. Depois de cadastrado, reentradas só informam a quantidade.
- Mantenha as operações transacionais e autorizadas por perfil.

**1.4 Alertas de validade do CA.**
- Níveis: 30, 15 e 7 dias para vencer, e vencido. Quanto menos dias, mais destaque (cor e texto, nunca só cor).
- Mostrar em um card no dashboard e em destaque no catálogo, para `ALMOXARIFADO`, `RH` e `SEGURANCA`.
- A regra existente que impede emitir ficha com CA vencido continua valendo; confirme com teste.

## Fase 2: colaboradores e montagem de ficha

**2.1 Listas gerenciadas.** Crie tabelas, RLS e telas de administração (somente `ADMIN`) para clientes, unidades de trabalho e RACs.
- O cadastro de colaborador passa a ter cliente (dropdown), unidade de trabalho (dropdown) e RACs (seleção múltipla).
- Preserve os valores atuais de `work_unit`: a migration converte o texto existente em itens da nova lista, sem perder dados.
- RH e SST visualizam e filtram por cliente, unidade e RAC.

**2.2 Kit por cliente e função.**
- `ADMIN` e `RH` definem, para um par cliente e função, um conjunto de EPIs com a quantidade de unidades.
- Ao escolher o colaborador no montador de fichas, os itens do kit vêm marcados. O operador escolhe o tamanho de cada um e pode adicionar ou remover itens.
- Respeite estoque disponível: item sem saldo aparece sinalizado e não pode ser incluído na ficha.
- O kit é só ponto de partida; a ficha emitida continua sendo o snapshot de sempre.

**2.3 Montador de fichas.**
- A lista completa de equipamentos só aparece quando o usuário pesquisa ou filtra (categoria e tamanho ficam à esquerda).
- Corrija o bug: depois de filtrar e limpar o filtro, a opção "todos" não retorna os itens.
- Item sem estoque não pode ser selecionado, com mensagem clara.
- Mantenha a data de entrega por item (padrão: hoje, em `America/Sao_Paulo`) e o botão de remover item.

## Fase 3: cancelamento, devolução e desligamento

**3.1 Cancelar ficha pendente.** Garanta que exista na interface a ação de cancelar, com motivo obrigatório. Ela deve liberar as reservas, invalidar o link de assinatura e registrar auditoria. Reaproveite o endpoint existente.

**3.2 Devolução.**
- Novo fluxo de devolução ligado a uma ficha entregue, com motivo por item. Veja a legenda de motivos do modelo de ficha da empresa em `Backend/src/assets/company-form-2026.ts` e reaproveite os mesmos motivos (desligamento, quebra, rasgo, desgaste etc.).
- Para cada item, o operador define o destino: volta ao estoque ou baixa como descarte/avaria. Reaproveite o que a migration 006 já faz com quantidade avariada e não libere saldo histórico bloqueado.
- A devolução é um registro novo e só de acréscimo, com assinatura do colaborador (use a assinatura presencial com evidência já existente). Ela não altera o snapshot da ficha original.
- O PDF e o XLSX devem poder mostrar a ficha com suas devoluções (data, motivo, assinatura), com os dois formatos coerentes.
- Escreva uma nota curta de desenho em `docs/` antes de implementar, explicando as tabelas, os estados e os efeitos no estoque.

**3.3 Desligamento.**
- Ao preencher a data de desligamento no cadastro do colaborador, abrir um popup oferecendo gerar a devolução demissional, preenchida com os itens da última ficha assinada, para o colaborador assinar.
- Na lista de colaboradores, o usuário filtra por uma pessoa e vê a última ficha assinada dela.

## Fase 4: assinatura e documento

**4.1 Confirmação por CPF.**
- Na página pública de assinatura, o colaborador digita o nome completo, os 3 primeiros e os 3 últimos dígitos do CPF, além do código por e-mail que já existe.
- A comparação é feita só no servidor, contra o CPF cadastrado, com comparação de tempo constante.
- Máximo de 5 tentativas incorretas por link, contadas no Postgres. Ao atingir o limite, o link é bloqueado e o RH gera outro. Registre o evento em auditoria.
- A mensagem de erro é genérica e não revela qual campo falhou. Nunca devolva o CPF, nem parte dele, para a página pública, e nunca o escreva em log.
- Se o colaborador não tiver CPF cadastrado, mantém o fluxo atual, sem essa etapa.
- Respeite os limites que já existem (link de 24 horas, OTP de 10 minutos, 3 envios) e o rate limiting.

**4.2 CPF de teste.**
- Defina o CPF `93492854010` para todos os colaboradores de `database/supabase/seed.sql`, do repositório da demonstração e das fixtures de testes (unitários, PGlite e e2e).
- Para um banco de desenvolvimento já populado, entregue um script SQL separado, fora de `database/supabase/migrations`, com aviso no topo de que é só para desenvolvimento e nunca para produção. Não o execute.
- Atualize os testes e2e que assinam fichas para digitar `934` e `010`.

**4.3 "Assinado digitalmente".**
- Nas fichas assinadas eletronicamente, incluir no rodapé do PDF e do XLSX a indicação de assinatura digital, e exibir a mesma indicação na tela de aceite.
- Use somente as referências legais já documentadas em `docs/SIGNATURE-CONSENT.md`; não crie texto jurídico novo.
- Fichas assinadas presencialmente não recebem essa indicação.
- Isso afeta só documentos novos. Avalie se o modelo precisa de uma nova versão (hoje `COMPANY_EPI_2026_V4`) sem reescrever documentos já emitidos, e atualize o `README` dos assets.

## Fase 5: validação e documentação

- Escreva ou atualize testes para cada item: backend, demonstração, SQL/PGlite e Playwright. Os fluxos principais precisam de teste: tamanhos, CA, movimentação com justificativa, alertas, kit, devolução, desligamento, tentativas de CPF.
- Rode `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run db:check` e `npm run api:docs`. Reporte exatamente o que passou, o que falhou e o que não pôde ser executado. Não declare validado nada que dependa de Supabase, SMTP ou Storage hospedados.
- Atualize `docs/AGENT-CONTEXT.md`, `database/README.md` e o OpenAPI.
- Entregue um relatório curto em `docs/` com: o que mudou por fase, as migrations criadas, as divergências encontradas na Fase 0 e as pendências.

## Fora do escopo (não implemente)

- Ficha de ferramentas.
- Reconhecimento facial; o contrato futuro desabilitado continua como está.
- Integração com o ERP/RP e qualquer acesso ao banco dele.
- Tela de importação de planilha de colaboradores. A carga inicial será feita por código, quando o RH enviar o modelo; ainda não temos o formato.
- Anexar certificados ou controlar treinamentos neste sistema.
- WhatsApp ou e-mail corporativo na assinatura; o e-mail pessoal segue como está.
- Deploy, configuração de hospedagem e o gerador de assinatura de e-mail (outro portal).
- Contagem física do estoque antes do lançamento inicial (tarefa operacional).

## Cuidado de projeto

O sistema deve continuar utilizável por outras áreas (por exemplo produção e outras unidades), que terão regras de controle diferentes. Não codifique nomes de clientes, unidades ou RACs no código; tudo vem das listas gerenciadas.
