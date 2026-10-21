# Modelo de ficha da empresa

Fonte fornecida pelo usuário: `MODELO FICHA DE EPI 2026.xlsx` (aba `Planilha1`, área principal `A2:O29`).

SHA-256 do original, mantido sem alterações:

`F9931CFABF7FA8246455FC429E93664BEDD0873FFFE06EACC0435505378B0A98`

`company-model.ts` contém a cópia adaptada do workbook, o logotipo PNG extraído e os textos corporativos usados pelo PDF. Não depende do caminho Downloads para funcionar. O original foi inspecionado e renderizado com Artifact Tool; a cópia foi editada/exportada pela mesma ferramenta. Os prefixos XML de namespace foram normalizados sem alterar os valores, para leitura pelo ExcelJS. Metadados privados de autoria/localização do original não foram incorporados.

Preservados: logotipo, títulos, declaração, orientações, legendas de risco, identificação do funcionário, função, admissão/demissão e área de assinatura do colaborador. Conforme solicitações anteriores, removidos: assinatura/rubrica por item, data de devolução e M.D. A tabela usa data da entrega, quantidade fixa 1, descrição, C.A., marca e risco.

O Nº de Registro é a matrícula textual do cadastro, inclusive zeros à esquerda. A data abaixo da declaração vem da emissão no fuso America/Sao_Paulo; a entrega é editável por item e não confirma recebimento físico.

`company-document.service.ts` preenche a cópia XLSX e reproduz os elementos no PDF. É uma adaptação funcional, não uma reprodução pixel a pixel. Os textos da declaração são os fornecidos pela empresa; esta implementação não atesta sua atualização normativa ou validade jurídica. Modelos históricos seguem no gerador anterior para não reescrever documentos emitidos.
