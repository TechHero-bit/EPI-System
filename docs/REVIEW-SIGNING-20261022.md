# Catálogo protegido e assinatura na revisão — 22/10/2026

## Comportamento

- Descrição, C.A., marca e risco são cadastrados/alterados somente no Almoxarifado, pelos perfis autorizados. Na montagem da ficha aparecem apenas como texto. Seleção, tamanho e quantidade fixa 1 são preservados; a data de entrega continua editável antes da preparação.
- A API aceita somente variante, quantidade 1 e data da entrega por item. Payloads com campos de equipamento são recusados. O snapshot usa os valores atuais do catálogo, preservados após a emissão; uma edição posterior do cadastro não reescreve a ficha.
- O assistente tem quatro etapas. Na revisão, preparar a ficha congela o PDF exato e reserva os EPIs. Assinaturas precisam se referir a conteúdo imutável, por isso o documento é preparado antes do aceite, sem navegar ainda à etapa final.
- Por link: QR Code e URL individual são gerados localmente, sem serviço externo de QR. O token real continua aleatório de 256 bits, com armazenamento HMAC e validade de 24 horas no backend. O colaborador recebe OTP no e-mail verificado, confere o PDF e aceita. Não se exibe nem se substitui o OTP real por um código da demonstração.
- O avanço para a ficha final aguarda `SIGNED_ELECTRONIC`, consultado a cada 5 segundos ou manualmente. Assinar não confirma entrega nem baixa estoque.
- Presencial: o PDF pode ser conferido/impresso e o arquivo assinado registrado/anexado na revisão. É possível seguir para a ficha final para impressão ainda com assinatura presencial pendente; isso não registra um aceite inexistente.
- O painel de assinatura foi removido dos detalhes finais. Documento, status, entrega física, cancelamento e auditoria permanecem. A lista e os detalhes oferecem “Retomar revisão” para pendências. Recarregar a revisão não cria nova ficha/reserva; o link pode ser gerado novamente.
- Após preparar, dados, método e datas ficam bloqueados. Para corrigir o conteúdo, cancelar a reserva com motivo e iniciar outra ficha. Uma versão assinada nunca é editada.

## Demonstração e limites

A demonstração usa tokens aleatórios de 32 bytes, validade, consulta ao documento, aceite e uso único simulados. O armazenamento local é sincronizado na consulta para que o aceite em outra aba seja visto pela revisão. Isso não constitui autenticação real nem assinatura juridicamente válida. O QR/link demo só funciona com os dados salvos no mesmo navegador; celulares e outros computadores exigem o ambiente real acessível e configurado.

Supabase/Auth/Storage/SMTP hospedados não foram usados nesta rodada. A configuração real de e-mail verificado e SMTP continua necessária. Nenhuma migration foi alterada ou executada remotamente.

## Arquivos principais

- `Backend/src/schemas/sheet.schema.ts`: contrato estrito da emissão.
- `Backend/src/services/sheet-catalog.service.ts`: snapshot exclusivamente do catálogo.
- `Backend/src/controllers/sheet.controller.ts`: emissão e proteção contra gerar link para reserva cancelada.
- `Backend/src/config/openapi.ts` e `docs/openapi.json`: contrato atualizado.
- `Frontend/src/app/features/fichas-epi/pages/builder/`: revisão, QR, consulta, confirmação, retomada, assinatura presencial e cancelamento.
- `Frontend/src/app/features/fichas-epi/pages/detail/`: remoção do painel final de assinatura.
- `Frontend/src/app/features/fichas-epi/pages/sheets/`: acesso à revisão pendente.
- Modelos, repositório demo, serviço do portal, estilos, selos de status e testes foram atualizados.
- `qrcode` 1.5.4 e `@types/qrcode` 1.5.6 foram adicionados com versões fixadas no lockfile. O QR é carregado sob demanda. O build informa avisos CommonJS de `qrcode`/`dijkstrajs`, não falhas de compilação.

## Validação e segurança

`npm test`: 44 testes aprovados — 13 API/documentos, 12 demonstração e 19 SQL/RLS. Cobrem rejeição de campos forjados, congelamento do catálogo, tokens aleatórios, validade, aceite obrigatório, uso único e separação assinatura/entrega. `npm run test:browser`: 12 cenários Chromium aprovados, incluindo QR, confirmação em outra aba, retomada após refresh, ausência do painel final, assinatura presencial e exportações. Total: 56 testes.

`npm run typecheck`, `npm run build` e `npm run db:check` concluíram com código 0. Capturas da revisão em desktop e celular foram conferidas; não houve rolagem horizontal no cenário de 390 px. Uma comparação inicial do texto do selo de status foi corrigida para explicitar que a assinatura já foi registrada; a repetição integral da suíte passou. A consulta e o aceite foram testados em demonstração, não por leitura física do QR com câmera nem por envio SMTP real.

A instalação de dependências encontrou arquivos de cache de ferramentas bloqueados por processos existentes no Windows, mas concluiu com código 0; nenhuma limpeza forçada ou encerramento de servidor de outro projeto foi feito.

`npm audit --omit=dev` apontou 3 avisos de produção: alto em `nodemailer`, moderado em `exceljs` e em `uuid` transitivo. Essas dependências já existiam e não foram atualizadas nesta tarefa; a biblioteca de QR não aparece entre os avisos. O npm sugere mudanças de versão principal para correção, que exigem análise e testes separados. Não foi executado `audit fix --force`. A existência desses avisos impede tratar este trabalho local como homologação de segurança para produção.

Backup anterior: `C:\Users\kevindesouza\.codex\visualizations\2026\10\20\01a159cb-1307-7a03-8c3c-881314ab5367\EPI-System-before-review-signing-20261022.tar`, com código, configurações e Git; dependências/caches/builds regeneráveis excluídos. Nenhum push, PR, deploy ou SQL remoto foi realizado.
