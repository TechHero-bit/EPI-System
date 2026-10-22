# Modelo completo da ficha Centauro

As novas emissões usam `COMPANY_EPI_2026_V4`. O PDF parte da impressão nativa do Excel fornecido, incorporada no aplicativo. O XLSX parte da mesma cópia do modelo. Não há dependência de Excel ou Python em produção. O original foi preservado; o backup anterior às alterações está em `EPI-System-before-exact-company-form-20261022.tar`, no diretório de artefatos local desta conversa.

## Correspondência dos campos

| Campo | Origem | Célula no XLSX |
| --- | --- | --- |
| Funcionário | Cadastro do colaborador | B6:D7 |
| Nº do Registro | Matrícula textual do colaborador | F6:F7 |
| Função | Cadastro do colaborador | B8:F9 |
| Admissão | Cadastro do colaborador | B10:D12 |
| Demissão | Cadastro do colaborador, vazia quando ausente | F10:F12 |
| Local e data | Rio de Janeiro + data da emissão em Brasília | A17:F17 |
| Entrega, quantidade, descrição, C.A., marca, risco | Snapshot da emissão; quantidade 1 | A, B, C:D, E, F:G, I:J, a partir da linha 21 |

As áreas gerais de assinatura e as colunas de rubrica, devolução e M.D. permanecem no documento conforme o modelo, sem preenchimento fictício. A presença dessas áreas não muda a separação entre assinatura eletrônica e confirmação da entrega física. Os campos de equipamento continuam exclusivos do Almoxarifado.

## Layout e textos longos

O cabeçalho, declaração, legendas e colunas são preservados. A cópia organiza vinte linhas contínuas por página, substituindo o segundo cabeçalho e as linhas mescladas que estavam fora da impressão principal do original. Os campos do colaborador foram divididos em rótulo e valor dentro das mesmas áreas para caber o preenchimento. Textos longos são medidos, quebrados e acomodados em linhas adicionais, com uma nova página completa quando necessário. Cada página corresponde a uma aba no Excel. Campos de data continuam tipados e matrícula/C.A. preservam zeros à esquerda.

Os scripts em `Backend/scripts/` permitem reconstruir o asset a partir do original. A impressão do modelo é feita em uma instância oculta e privada do Microsoft Excel, aberta somente para leitura. O aplicativo utiliza apenas os bytes compilados e as coordenadas, com PDF-lib e ExcelJS.

O modelo anterior V3 permanece disponível para documentos históricos. Uma ficha já preparada não é reescrita nem recebe um novo hash silenciosamente. Para usar o novo layout, emita uma nova ficha.

## Validação

`npm run build` aprovado para Angular e backend. O Angular mantém os avisos CommonJS já existentes de `qrcode` e `dijkstrajs`.

`npm test`: 49 testes aprovados. Dois testes Playwright de emissão e download aprovados, cobrindo matrícula textual, datas de entrega e campos do catálogo no Excel baixado. Typecheck aprovado. As amostras fictícias normal e com os quinze itens no limite de tamanho foram geradas em PDF/XLSX; o caso extenso ocupa cinco páginas/abas. Todas as páginas do PDF foram renderizadas e conferidas, e os dois workbooks foram abertos somente para leitura e impressos pelo Microsoft Excel. O SHA-256 do original foi conferido novamente e permaneceu inalterado.
