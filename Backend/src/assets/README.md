# Modelo de ficha da empresa

Fonte fornecida pelo usuário: `MODELO FICHA DE EPI 2026.xlsx` (aba `Planilha1`, área principal `A2:O29`).

SHA-256 do original, mantido sem alterações:

`F9931CFABF7FA8246455FC429E93664BEDD0873FFFE06EACC0435505378B0A98`

## Modelo vigente: COMPANY_EPI_2026_V4

`company-form-2026.ts` incorpora o workbook-base e sua impressão PDF exportada pelo Microsoft Excel. O PDF do sistema preenche essa impressão nas posições medidas dos campos. O XLSX preenche as células correspondentes. O modelo mantém as dez colunas, logo, títulos, declaração completa e todas as legendas do arquivo fornecido. A solicitação de 22/10/2026 substitui a simplificação anterior de seis colunas: rubricas, devolução e M.D. voltam ao documento, como espaços em branco. Não são novos campos editáveis no assistente e nenhuma assinatura é inventada.

A grade tem vinte linhas contínuas por página. As linhas de continuação e o segundo cabeçalho que ficavam fora da área de impressão do arquivo original são normalizados nessa cópia. Textos extensos ocupam mais linhas da grade e, quando necessário, outra página completa do modelo. O original em Downloads não é alterado.

O Nº de Registro é a matrícula textual do cadastro, inclusive zeros à esquerda. A data abaixo da declaração vem da emissão no fuso America/Sao_Paulo; a entrega é editável por item e não confirma recebimento físico.

O preenchimento é realizado por `company-form.service.ts`, compartilhado pela API e pela demonstração. O funcionamento da aplicação não depende de Excel, Python ou arquivos em Downloads. Matrícula e C.A. são texto para preservar zeros à esquerda. Admissão, demissão e entrega são datas nativas no XLSX; a data por extenso abaixo da declaração é a data de emissão em Brasília.

## Reconstrução do asset (desenvolvimento, Windows)

1. `node --import tsx Backend/scripts/prepare-company-template.ts "C:/Users/kevindesouza/Downloads/MODELO FICHA DE EPI 2026.xlsx"`
2. `powershell -File Backend/scripts/export-company-template.ps1`
3. Execute `Backend/scripts/compile-company-template.py` com Python e `pdfplumber` instalados (ou com o runtime de documentos fornecido pelo ambiente de desenvolvimento).
4. `npm run documents:preview` e confira as amostras em `dist/document-preview/`.

A preparação usa o mesmo ExcelJS já empregado pela aplicação para preencher a cópia. A exportação abre apenas a cópia temporária em uma instância privada, oculta e somente leitura do Excel; encerra essa instância ao finalizar. O compilador mede os limites e as fontes da impressão, embute os arquivos e registra o hash da fonte. Os metadados de autoria/localização do arquivo recebido não são distribuídos.

## Histórico

`company-model.ts` e `company-document.service.ts` preservam o modelo adaptado V3 com seis colunas. As versões anteriores continuam disponíveis para exportar os snapshots históricos sem mudar documentos emitidos. A versão V4 é usada somente em novas emissões.
