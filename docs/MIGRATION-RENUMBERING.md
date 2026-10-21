# Renumeração antes da primeira instalação

O usuário confirmou que nenhuma migration havia sido executada no Supabase e autorizou a remoção da migration de contador por ficha. Por isso, os nomes passaram a começar diretamente por 001 a 006, sem alterar histórico de banco hospedado.

| Nome anterior                                | Nome atual                           |
| -------------------------------------------- | ------------------------------------ |
| `202610190001_init.sql`                      | `001_init.sql`                       |
| `202610200001_audit_email_verification.sql`  | `002_audit_email_verification.sql`   |
| `202610200002_manual_signature.sql`          | `003_manual_signature.sql`           |
| `20261020120000_reservations_and_access.sql` | `004_reservations_and_access.sql`    |
| `20261020130000_signing_identity.sql`        | `005_signing_identity.sql`           |
| `202610210001_sheet_register.sql`            | Removida: contador por ficha sem uso |
| `202610210002_inventory_without_lots.sql`    | `006_inventory_without_lots.sql`     |

A nova 006 cria diretamente a função e o trigger de validação da matrícula. Não depende mais da migration removida e não cria as tabelas de contador/alocações, a função de reserva de número nem a coluna `sheets.record_number`. O bootstrap da API foi ajustado para não consultar essa coluna. A matrícula textual continua em `employee_registration` e no snapshot.

As demais cinco migrations ainda são necessárias: nenhuma ficou integralmente sem função. Seus efeitos incluem estrutura, permissões, auditoria, assinatura presencial, reservas e identificação do signatário. As etapas de transição de lotes e seus testes de integridade foram mantidos; os lotes não voltam ao fluxo ativo.

Referências de execução, índice, testes e `setup.sql` foram atualizados. Relatórios históricos anteriores podem citar os nomes antigos; a correspondência acima explica essas referências. Para instalar em banco novo, use o consolidado ou as seis migrations em ordem, nunca ambos. Não reaplique a inicial sobre um banco existente.

O gerador de `setup.sql` recusa nomes fora do padrão numérico ou sequência com lacunas. Os testes verificam os seis nomes/cabeçalhos, a ausência das estruturas de contador, a instalação limpa, a transição de estoque, a matrícula e as demais regras transacionais.

Validação local: `npm test` aprovou 40 testes (11 API/documentos, 10 demonstração, 19 SQL/RLS). `npm run db:check` conferiu o consolidado e `npm run typecheck` aprovou Backend e Frontend. Não houve execução da CLI contra projeto Supabase hospedado, nem testes de integração remotos.

Backup anterior à alteração: `C:\Users\kevindesouza\.codex\visualizations\2026\10\20\01a159cb-1307-7a03-8c3c-881314ab5367\EPI-System-before-migration-renumbering.tar` (código, configurações e Git; dependências, caches e builds regeneráveis excluídos). Os arquivos anteriores também são recuperáveis no Git. Nenhum banco remoto foi acessado, alterado ou excluído; não houve push, PR ou deploy.
