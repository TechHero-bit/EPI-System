# Relatório: alterações da reunião de validação (09/11/2026)

Implementação das solicitações de Almoxarifado, RH e Segurança do Trabalho. Nada foi publicado, enviado por `git push` nem commitado; as mudanças estão na árvore de trabalho. Nenhum SQL foi executado em banco hospedado.

## Migrations criadas

| Nº | Arquivo | Conteúdo |
| --- | --- | --- |
| 010 | `010_catalog_ca_inventory.sql` | `variants.active` e `sync_product_sizes`; `issue_sheet` recusa tamanho inativo; `ca_registry` + `import_ca_batch`; `move_inventory` (entrada, retirada, ajuste, sempre com justificativa); novos tipos `WITHDRAWAL` e `RETURN`; `operate_inventory` revogada do serviço. |
| 011 | `011_managed_lists_kits.sql` | `clients`, `work_units`, `racs`, `employee_racs`, `epi_kits`, `epi_kit_items`, RLS, `set_employee_racs`, `save_epi_kit`; conversão de `employees.work_unit` em itens de `work_units` sem perda (coluna textual mantida). |
| 012 | `012_sheet_returns.sql` | `sheet_returns`, `sheet_return_items` (imutáveis), `register_sheet_return`. |
| 013 | `013_signer_identity_check.sql` | Tentativas de confirmação por link, bloqueio na quinta, `record_identity_check`; `complete_signature` exige a confirmação quando há CPF; evidência registra o método sem dígitos. |

`database/README.md` (índice), `database/setup.sql` (`npm run db:setup`) e o teste de numeração foram atualizados.

## O que mudou, por fase

### Fase 0 – reconhecimento (estado encontrado)

- Linha de base antes de qualquer mudança: `typecheck` OK; `npm test` 56/56 (17 backend, 17 demonstração, 22 SQL); `db:check` OK; `test:browser` 23/23.
- Cancelamento (`POST /sheets/:id/cancel`): já existia, com tela na revisão do montador e no detalhe da ficha e motivo obrigatório. Não foi refeito; ganhou testes.
- Devolução: não existia fluxo; o modelo da empresa tinha as colunas e a legenda de motivos, em branco.
- Tamanho e estoque lado a lado: não; o catálogo mostrava só o total.
- Filtros de categoria e tamanho no montador: existiam, acima da lista.
- `work_unit`: texto livre. `cpf`: coluna opcional desde a 004. `ca_expires_at`: existente e já bloqueando emissão.
- `termination_date`: só impedia novas fichas; nenhum outro efeito.
- "Assinado digitalmente" no rodapé de PDF/XLSX de fichas eletrônicas: já existia.

### Fase 1 – catálogo, C.A. e almoxarifado

- Cadastro de EPI com grade (Único, letras ou números, com "marcar intervalo"); cada tamanho marcado vira variante validada pelo contrato. Na edição, desmarcar tamanho com saldo, reserva ou histórico o desativa. Catálogo mostra o estoque disponível de cada tamanho.
- Base CAEPI: serviço de leitura por cabeçalho, comando `npm run ca:import` (lotes, idempotente, fora do serverless), endpoint `GET /api/ca/:numero`. O cadastro preenche validade e dados, tudo editável, e a falha nunca bloqueia. Demonstração com conjunto fictício embutido. Origem e frequência em `docs/CAEPI-IMPORTACAO.md`.
- Movimentação no topo da página: escolha do EPI com os tamanhos e saldo ao lado; operação Entrada, Retirada fora de ficha ou Ajuste, todas com justificativa; busca por C.A. que seleciona o item ou abre o cadastro no mesmo fluxo.
- Alertas de C.A. (30, 15, 7 dias e vencido), com texto e destaque crescente, no dashboard de todos os perfis e no catálogo (ordenado do mais urgente). Emissão com C.A. vencido continua bloqueada (teste SQL e demonstração).

### Fase 2 – colaboradores e montagem de ficha

- Telas de administração (ADMIN) para clientes, unidades e RACs: incluir, renomear, desativar e reativar.
- Cadastro do colaborador com cliente, unidade (listas) e RACs (seleção múltipla); lista de colaboradores com filtros por cliente, unidade e RAC.
- Kits por cliente e função (`/rh/kits`, ADMIN e RH). O painel do kit no montador foi implementado e depois retirado a pedido do usuário; os kits continuam cadastrados, mas hoje não pré-preenchem a ficha.
- Montador: filtros à esquerda; a lista só aparece após pesquisa, filtro ou "Ver todos os equipamentos"; item sem estoque ou com C.A. vencido mostra o motivo e não pode ser incluído; data por item e remoção mantidas.
- Bug corrigido: ao voltar para "Todas as categorias", o tamanho escolhido (ex.: M) continuava aplicado e a lista não voltava completa. Agora "todas" limpa o tamanho dependente, no montador e no catálogo; há também "Limpar filtros".

### Fase 3 – cancelamento, devolução e desligamento

- Cancelamento: confirmado e coberto por testes (libera reserva, invalida link, audita o motivo).
- Devolução (nota de desenho escrita antes: `docs/DEVOLUCAO-DESENHO-20261109.md`): tela `/rh/fichas/:id/devolucao` para fichas entregues, com motivo M.D. por item (legenda do modelo), destino por item e assinatura presencial com evidência. Registro somente de acréscimo; snapshot intacto. PDF e XLSX mostram data, M.D. e "Assinatura presencial" nas colunas do próprio modelo.
- Desligamento: salvar a data de desligamento abre um popup que leva à devolução demissional da última ficha assinada e entregue, com os itens marcados e motivo 13. A lista de colaboradores mostra a última ficha assinada de cada pessoa.

### Fase 4 – assinatura e documento

- Confirmação por nome completo + 3 primeiros + 3 últimos dígitos do CPF, além do código por e-mail; comparação só na API, em tempo constante; 5 tentativas por link contadas no Postgres; bloqueio auditado; mensagem genérica; nenhum dígito vai para a página, log, auditoria ou evidência. Sem CPF, fluxo anterior.
- CPF de teste `93492854010` em `seed.sql`, na demonstração e nas fixtures (unitárias, PGlite e e2e). Script separado `database/scripts/dev-set-test-cpf.sql` com aviso de uso exclusivo em desenvolvimento (não executado). O e2e de assinatura digita 934 e 010.
- "Assinado digitalmente": já presente no rodapé do PDF/XLSX das fichas eletrônicas (e ausente nas presenciais); a tela de aceite passou a mostrar a mesma indicação, com a referência já documentada (MP 2.200-2/2001, art. 10, § 2º). Avaliação: não é necessária uma V5 do modelo, porque nada muda no layout nem no original emitido (README dos assets atualizado).

## Ajustes após revisão (09/11/2026)

- Assinatura: o botão de aceite só é liberado depois que o servidor confirma nome e dígitos do CPF (`POST /api/sign/:token/identity`); a página nunca recebe o CPF. Dados da demonstração salvos antes da mudança recebem o CPF de teste.
- Kits: função é texto livre (sem lista de sugestões); equipamentos escolhidos como no montador (filtros à esquerda, cartões que somam 1 unidade, resumo com + e −). Por decisão posterior do usuário, ADMIN e RH incluem clientes direto na tela de kits (`POST /api/admin/lists/clients`); renomear, desativar e gerenciar unidades e RACs continua só com ADMIN. Dados antigos da demonstração recuperam os clientes, unidades, RACs e kit fictícios.

## Divergências encontradas e decisões tomadas

1. **Seletor "igual ao do dashboard"**: o dashboard não tem seletor de EPI. Foi implementado o padrão pedido (escolher o EPI e ver os tamanhos com saldo ao lado), reaproveitando os estilos de seleção existentes.
2. **Catálogo para RH e Segurança**: a rota do catálogo é restrita a ADMIN e ALMOXARIFADO, e a API só deixa esses perfis alterarem equipamentos. Para não ampliar acesso, RH e Segurança veem os alertas no card do dashboard; o destaque no catálogo aparece para quem já acessa o catálogo.
3. **ADMIN na demonstração**: o login demonstrativo oferece só RH e Almoxarifado, regra coberta por um teste existente. Foi mantida; as telas de listas (ADMIN) foram testadas no repositório da demonstração (unidade), não no navegador.
4. **Descarte/avaria na devolução**: a migration 006 coloca unidades avariadas de lotes legados em `blocked_quantity`. Na devolução, "baixa como descarte" não altera o saldo (a unidade já saiu na entrega); colocá-la em saldo bloqueado inflaria permanentemente o estoque físico, já que não existe fluxo de baixa de bloqueados. A devolução nunca libera saldo bloqueado histórico.
5. **Motivo 12 ("1ª Entrega")**: está na legenda do modelo, mas descreve uma entrega; não é aceito como motivo de devolução.
6. **Formato CAEPI**: confirmado no tutorial oficial (pipe, cabeçalho, DD/MM/AAAA, ANSI, atualização diária às 20h). O tutorial não lista todas as colunas por escrito; por isso o importador localiza as colunas pelo nome e recusa o arquivo se faltar `NRRegistroCA`, `DataValidade` ou `Situacao`. Não houve download do arquivo real nem teste contra ele.
7. **Nome do titular visível na página pública**: a página já mostrava "Use o nome do titular: …" após o código. Foi mantido (fora do escopo); a força da nova etapa está nos dígitos do CPF.
8. **Incidente local**: um `npx tsc` executado na raiz baixou para o cache do npx o pacote obsoleto `tsc@2.0.4` (não é o TypeScript). Nenhum manifesto, lockfile ou arquivo do projeto foi alterado; os typechecks oficiais usam `npm run typecheck`. Se quiser, limpe o cache com `npm cache clean --force`.

## Pendências

- Validar com Supabase hospedado, PostgREST, SMTP e Storage reais: nada disso foi executado. Os testes SQL usam PGlite.
- Aplicar 010 a 013 no banco de desenvolvimento, conferir a conversão de `work_unit` e, se desejado, rodar `dev-set-test-cpf.sql`.
- Baixar o `tgg_export_caepi.txt` oficial e rodar `npm run ca:import -- <arquivo> --dry-run` para conferir o cabeçalho real.
- Cadastrar pelo ADMIN as listas reais de clientes, unidades e RACs e os kits; a carga inicial de colaboradores segue fora do escopo.
- Lista de colaboradores e popup de desligamento usam as 100 fichas mais recentes carregadas no bootstrap (limite já existente).
- Revisão jurídica do texto exibido na tela de aceite, se a empresa quiser alterar algo (nenhum texto novo foi criado).

## Verificação final

Executado localmente em 09/11/2026, depois de todas as fases:

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | OK (backend e frontend) |
| `npm test` | 85/85: backend 26, demonstração 25, SQL/PGlite 34 |
| `npm run db:check` | OK (`setup.sql` corresponde às migrations 001–013) |
| `npm run build` | OK (avisos de módulos CommonJS do `qrcode`, já existentes) |
| `npm run test:browser` | 29/29 (23 antigos, ajustados à nova interface, e 6 novos em `Frontend/e2e/meeting.spec.ts`) |
| `npm run api:docs` | OK; `docs/openapi.json` regenerado (versão 0.3.0) e estável |
| `npm run ca:import -- <amostra fictícia> --dry-run` | OK (sem banco) |

Na primeira execução completa de `npm test`, um teste antigo da demonstração falhou porque esperava a mensagem específica de nome; com o CPF de teste a mensagem passou a ser genérica, como pedido. O teste foi ajustado e a suíte inteira rodou de novo (resultado acima).

Novos testes: `database/tests/meeting-changes.test.ts` (SQL), `Backend/test/ca-registry.test.ts`, `Backend/test/returns-document.test.ts`, `Backend/test/signer-identity.test.ts`, `Frontend/test/meeting-demo.test.ts` e `Frontend/e2e/meeting.spec.ts`. Cobrem tamanhos, C.A., movimentação com justificativa, alertas, listas, kit, montador, cancelamento, devolução, desligamento e tentativas de CPF.

Não executado ou não validado: Supabase hospedado (Auth, PostgREST, Storage), SMTP, importação do arquivo CAEPI real, e o fluxo real de assinatura por link com e-mail. As telas de listas do ADMIN foram testadas só no repositório da demonstração, não no navegador.
