# Decisões e limites da versão 0.1

O monorepo separa `frontend/` (Angular), `backend/` (API Node/TypeScript) e `database/` (migrations Supabase). O arquivo raiz `api/index.ts` é apenas o adaptador de função da Vercel. Mover uma migration não a aplica novamente nem modifica o banco remoto.

## Modelo e controles

`organizations` isola empresas; `memberships` define `ADMIN`, `ALMOXARIFADO`, `RH`, `SEGURANCA`. `employees` guarda apenas cadastro e e-mail de contato. `products` → `variants` → `lots` modela descrição/CA/marca, tamanho/SKU e fornecedor/lote/validade/saldo. `stock_movements` é o razão de entradas/saídas; não se edita saldo sem movimento.

`sheets` contém versão, snapshot de campos editáveis e hashes; triggers rejeitam atualização/exclusão. `sheet_items` tem `check(quantity = 1)`. `issue_sheet` bloqueia lotes e decrementa exatamente uma unidade por linha em uma transação. `sheet_state`, `signatures` e `receipts` registram eventos posteriores, sem alterar o documento emitido. O PDF guarda o conteúdo exato em bucket privado, sem URL pública permanente. Os endpoints de download verificam hash antes de entregar bytes.

O papel de serviço do Supabase fica somente na API. As tabelas têm RLS e privilégios de escrita revogados para `anon` e `authenticated`. A API verifica o JWT por chamada, resolve a organização do usuário e confere papéis antes de usar o serviço. As funções de transação aceitam execução só de `service_role` e validam o papel de quem solicita. É preciso testar RLS no Supabase real antes de abrir produção.

## Estados

| Evento | Assinatura | Recebimento físico | Estoque |
|---|---|---|---|
| Ficha emitida | Pendente manual/eletrônica | Não confirmado | -1 por item |
| Link assinado com código | Eletrônica simples registrada | Não confirmado | Sem novo movimento |
| Entrega física confirmada | Sem mudança | Confirmado | Sem novo movimento |

O link usa 32 bytes aleatórios; apenas HMAC-SHA-256 do token é persistido. Validade 24 h, uso único. O código de 6 dígitos vai ao e-mail verificado, vale 10 minutos, tem limite de 5 erros e até 3 envios. O PDF é mostrado via URL assinada de 60 segundos após o código. Evidência inclui hash do PDF, instante UTC, IP, agente e termos aceitos. A rotina diária remove IP e agente após 90 dias por padrão; duração e acesso devem ser ratificados na política de retenção. Repetir a confirmação do mesmo link já consumido retorna sucesso sem duplicar assinatura. Um webhook externo futuro deverá usar chave/idempotência e chamar a mesma transição; não deve fazer update direto de `sheets`.

A verificação técnica de e-mail não prova, sozinha, que o endereço pertence ao colaborador: um operador com acesso ao cadastro pode informar um endereço sob seu controle. A vinculação inicial do endereço à pessoa exige conferência independente e procedimento auditado antes de permitir assinatura remota. O MVP não deve ser tratado como autenticação forte ou identificação inequívoca.

## Campo original e saída

A foto recebida não permite reproduzir medidas, tipografia, logotipo e redação integral com precisão. A geração atual é um comprovante **provisório**, sem assinatura/rubrica por linha, data de devolução e M.D. O RH preenche nome, registro, função, datas e itens (descrição, CA, marca, risco); quantidade é fixa. A opção manual mantém linha vazia para assinatura posterior. Nunca preencher uma assinatura fictícia na exportação.

Quando o PDF fonte chegar, criar um mapeamento de posições e testes de regressão visual da saída PDF/Excel, validar com RH/SST e versionar novo template. Uma ficha emitida continua apontando para a versão do template com que nasceu.

## Conformidade a validar

A [NR-6 do MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-6-nr-6) contempla registro de fornecimento de EPI e seleção conforme riscos. A [Lei 14.063/2020](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm) distingue assinaturas simples, avançadas e qualificadas; esta implementação só identifica a simples. A [MP 2.200-2/2001](https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm) trata de ICP-Brasil e outros meios de comprovação aceitos. A [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) classifica biometria vinculada à pessoa como dado sensível. A adequação deste caso concreto deve ser avaliada com jurídico/SST e encarregado de dados; o código não declara equivalência legal nem substitui treinamento e entrega física.
