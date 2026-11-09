# Devolução de EPI: nota de desenho (09/11/2026)

Esta nota foi escrita antes da implementação (migration `012_sheet_returns.sql`).

## Objetivo

Registrar a devolução de itens de uma ficha **já entregue**, com motivo por item, destino físico de cada unidade e assinatura presencial do colaborador. A ficha original continua sendo um snapshot imutável: a devolução é um registro novo, somente de acréscimo, e não altera snapshot, hash, PDF original nem evidências.

## Tabelas

- `sheet_returns`: um evento de devolução. Guarda organização, ficha, colaborador, data da devolução (data local informada pelo operador), operador, observações da assinatura presencial (evidência), chave de idempotência e data de registro. Indica se é devolução demissional (`termination`).
- `sheet_return_items`: uma linha por unidade devolvida. Guarda a posição do item no snapshot (`item_index`), o `sheet_item_id` correspondente, a variante, o código do motivo e o destino. `unique(sheet_item_id)` e `unique(sheet_id, item_index)` impedem devolver a mesma unidade duas vezes.
- As duas tabelas recebem o mesmo trigger de imutabilidade das fichas (`reject_sheet_change`): não há atualização nem exclusão.
- `stock_movements` aceita o novo tipo `RETURN` (+1), criado na migration 010.

## Motivos (legenda do modelo da empresa)

Os códigos são os da legenda "Motivos de Devolução – M.D." do `MODELO FICHA DE EPI 2026.xlsx` (`Backend/src/assets/company-form-2026.ts`): 1 Quebrou, 2 Deslocou, 3 Sujou, 4 Amassou, 5 Rasgou, 6 Arrebentou, 7 Endureceu, 8 Saturou, 9 Furou, 10 Extraviou, 11 Venceu, 13 Desligamento, 14 Não utilizado. O código 12 ("1ª Entrega") descreve uma entrega, não uma devolução, e não é aceito. A lista fica em `contracts/returns.mts`, espelhada por constraint SQL.

## Estados

- Só fichas com `reservation_status` em `DELIVERED` ou `LEGACY_ISSUED` (estoque já baixado) aceitam devolução. Fichas pendentes, reservadas ou canceladas não: nesses casos o fluxo correto é o cancelamento, que libera a reserva.
- Cada unidade da ficha pode estar em dois estados derivados: "com o colaborador" (sem linha de devolução) ou "devolvida" (com linha). Não há coluna de estado nova em `sheet_state`; a ficha continua `DELIVERED`.
- Devoluções parciais são permitidas; várias devoluções podem existir para a mesma ficha, cada uma com seus itens.

## Efeitos no estoque

| Destino | Efeito |
| --- | --- |
| `RESTOCK` (volta ao estoque) | `inventory_stock.stock_quantity + 1` na variante do item e movimento `RETURN` +1 com o motivo. A unidade fica disponível. |
| `DISCARD` (descarte/avaria) | Nenhuma alteração de saldo: a unidade já saiu na confirmação da entrega e não volta. O registro fica no item da devolução e na auditoria. |

A devolução nunca altera `reserved_quantity` nem `blocked_quantity`. Saldo bloqueado histórico (lotes vencidos/avariados da migration 006) continua bloqueado; a devolução não libera esse saldo. Variante inativa pode receber a unidade de volta (o saldo fica registrado; a variante continua fora de novas fichas até ser reativada).

## Assinatura

Reaproveita a assinatura presencial com evidência já existente: o operador (ADMIN, RH ou Segurança do Trabalho) registra, na mesma transação, as observações da assinatura presencial (quem devolveu, quem recebeu, onde o documento físico foi arquivado). A evidência é imutável e entra na auditoria (`SHEET_RETURN_RECORDED`). Não há assinatura eletrônica de devolução nesta versão.

## Documento

O PDF e o XLSX da ficha passam a mostrar, na cópia para impressão, as colunas já existentes do modelo: **Data da Devolução**, **M.D.** (código do motivo) e **Assinatura/Rubrica** da devolução ("Assinatura presencial"). O PDF original armazenado e seu hash não mudam; a cópia é gerada a partir do snapshot mais os registros de devolução, como já acontece com a cópia assinada. Os dois formatos usam a mesma função de dados para manter coerência.

## Desligamento

Ao preencher a data de desligamento no cadastro, a tela oferece abrir a devolução demissional da última ficha assinada e entregue, com todos os itens ainda não devolvidos pré-selecionados e motivo 13 (Desligamento). O operador escolhe o destino de cada item e registra a assinatura presencial.
