# Base CAEPI: origem, importação e atualização

## Origem dos dados

A consulta automática de C.A. usa a base pública do sistema CAEPI do Ministério do Trabalho e Emprego. Conforme o tutorial oficial "Passo a passo para importar base de dados do sistema CAEPI para o Microsoft Excel" (Coordenação de Normatização e Registro – CNOR/CGSST/SIT, publicado em gov.br/trabalho-e-emprego), verificado em 09/11/2026:

- Endereço: `ftp://ftp.mtps.gov.br/portal/fiscalizacao/seguranca-e-saude-no-trabalho/caepi/`
- Arquivo: `tgg_export_caepi.txt` (o portal gov.br também oferece uma cópia compactada `tgg_export_caepi.zip`).
- Formato: texto delimitado por `|`, primeira linha com os nomes das colunas (`NRRegistroCA`, `DataValidade`, `Situacao`, `NRProcesso`, `CNPJ`, `RazaoSocial`, `Natureza`, `NomeEquipamento`, ...), datas no formato DD/MM/AAAA, origem Windows (ANSI).
- Atualização da origem: diária, às 20h (segundo o tutorial).

O importador lê as colunas **pelo nome do cabeçalho**, não pela posição. Se `NRRegistroCA`, `DataValidade` ou `Situacao` não existirem, a importação é recusada. Colunas usadas: `NRRegistroCA`, `DataValidade`, `Situacao`, `NomeEquipamento`, `DescricaoEquipamento`, `RazaoSocial` (fabricante) e `MarcaCA`. Quando o mesmo C.A. aparece em várias linhas, fica a de maior validade.

Relatos de terceiros indicam que o FTP já disponibilizou arquivos corrompidos e que o portal CAEPI bloqueia raspagem automatizada. O sistema não faz raspagem nem acessa a rede durante a importação: o arquivo é baixado manualmente da origem oficial e informado ao comando.

## Importação

```powershell
npm run ca:import -- C:\caminho\tgg_export_caepi.txt --dry-run
npm run ca:import -- C:\caminho\tgg_export_caepi.txt
```

- Exige `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no `.env` (somente backend). `--dry-run` só lê e conta.
- Processa em lotes de até 1.000 registros (`import_ca_batch`), cada um uma transação curta; roda fora das funções serverless, sem limite de tempo da Vercel.
- Idempotente: repetir o mesmo arquivo produz o mesmo resultado. Uma nova execução substitui os dados de execuções anteriores.
- Use `--utf8` se o arquivo já tiver sido convertido para UTF-8.

## Consulta

`GET /api/ca/{número}` (ADMIN, ALMOXARIFADO, RH e SEGURANÇA DO TRABALHO) devolve validade, situação, equipamento, fabricante e marca. No cadastro de EPI, a consulta preenche a validade e, se estiverem vazios, descrição e marca; todos os campos continuam editáveis, e a falha da consulta nunca bloqueia o cadastro manual. A demonstração usa um conjunto fictício embutido (números iniciados em 99), sem rede.

## Frequência recomendada

Importar **semanalmente** e sempre antes de grandes entradas de estoque. Como o alerta de validade usa 30, 15 e 7 dias, uma defasagem de até 7 dias mantém o primeiro alerta (30 dias) com folga. A validade gravada no cadastro do equipamento é a que vale para emissão de fichas; a importação não altera equipamentos já cadastrados.
