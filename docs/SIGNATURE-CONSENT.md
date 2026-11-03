# Assinatura eletrônica e consentimento

Referência indicada pelo usuário: [ctresb/leis](https://github.com/ctresb/leis). Consultada em 28/10/2026. O acervo reúne transcrições com referências oficiais; não fornece um contrato pronto.

## Referências

- [MP 2.200-2/2001 no acervo](https://github.com/ctresb/leis/blob/main/federal/medidas-provisorias/2001/mpv-2200-2-2001-08-24.md) e [texto oficial na Câmara](https://www2.camara.leg.br/legin/fed/medpro/2001/medidaprovisoria-2200-2-24-agosto-2001-391394-normaatualizada-pe.html): art. 10, § 2º, meios de comprovação da autoria e integridade aceitos pelas partes. A aparência manuscrita é uma representação visual; a autenticação real continua exigindo código no e-mail verificado.
- [LGPD no acervo](https://github.com/ctresb/leis/blob/main/federal/leis-ordinarias/2018/lei-13709-2018-08-14.md) e [fonte indicada pelo acervo](https://normas.leg.br/?urn=urn:lex:br:federal:lei:2018-08-14;13709): finalidade, necessidade, transparência e direitos do titular. O aceite da assinatura não é autorização genérica de tratamento de dados nem define sozinho a base legal do tratamento trabalhista.

O texto operacional está em `contracts/signature.mts`, versão `EPI-ELECTRONIC-SIMPLE-V2`. Requer revisão da empresa considerando seu papel como controladora, canal de atendimento aos titulares, bases legais e prazos de retenção. Não promete imunidade contra processos nem transfere obrigações legais do empregador.

## Registro e operação

O usuário digita o nome do titular, escolhe o estilo, confere o documento e marca o aceite, inicialmente desmarcado. Mudanças no nome ou estilo desmarcam o aceite. Interface, API e transação do banco verificam os requisitos de confirmação.

Nome, estilo, texto e versão do termo, data e hash do PDF são registrados na assinatura e nas evidências imutáveis. O portal carrega as fontes abertas Dancing Script, Caveat e Allura, também incorporadas ao PDF para preservar os três estilos na impressão. O PDF original é preservado. Após a assinatura eletrônica, o download gera uma cópia para impressão com o nome e o estilo escolhido em cada campo de assinatura da entrega de um EPI preenchido; as fontes abertas são incorporadas ao PDF. O PDF e o Excel também exibem a assinatura no campo geral ao lado da data e o texto “Assinado digitalmente” no rodapé de cada página assinada; o hash do original permanece nos metadados do PDF e nos detalhes da ficha. Campos de devolução e linhas vazias permanecem sem indicação. O Excel exportado preenche cada campo de assinatura da entrega com o nome e a fonte do estilo escolhido no portal, ajustando o texto à largura da célula. A exibição depende da disponibilidade da fonte no computador que abre o Excel. Assinaturas antigas sem estilo salvo mantêm a indicação “Assinado digitalmente”. O nome, estilo e termo completos permanecem nos detalhes da ficha. Este fluxo não utiliza certificado ICP-Brasil.

A demonstração é fictícia, sem validade jurídica. No ambiente real, a visualização do documento exige validação do código enviado ao e-mail.

Em bancos existentes com 001 a 007 aplicadas, executar somente `database/supabase/migrations/008_typed_signature.sql` antes de publicar a API atualizada. `database/setup.sql` é apenas para banco novo.
