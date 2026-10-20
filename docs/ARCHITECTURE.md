# Arquitetura e decisões

O monorepo contém frontend Angular com rotas lazy, backend Express e migrations Supabase. A demonstração é um repositório local isolado que nunca chama a API; o modo real usa Supabase Auth e JWT verificado pela API. Falhas reais não ativam demonstração automaticamente.

A API usa service_role somente no servidor e valida organização e perfil em cada operação. RLS protege o acesso direto; usuários não recebem permissões SQL de mutação. ALMOXARIFADO não baixa documentos pessoais nem consulta CPF. RH e SEGURANCA_TRABALHO montam fichas; ADMIN administra outros perfis sem alterar o próprio.

A ficha é um snapshot imutável com hash e arquivo privado. Emissão cria reservas transacionais de uma unidade por item. Assinatura não altera a entrega. Confirmação física consome reservas e gera saídas unitárias; cancelamento libera reservas. Locks por lote e colaborador e chaves de idempotência protegem concorrência. Reservas não expiram automaticamente: cancelamento é uma decisão operacional explícita.

Assinatura eletrônica simples: token aleatório de 256 bits (HMAC persistido), prazo de 24 horas, OTP de dez minutos no e-mail previamente verificado, cinco tentativas, três envios por link, visualização do documento exato, aceite e evidência imutável. O canal é fixado no link. Um limitador em PostgreSQL funciona entre instâncias serverless. A titularidade do e-mail precisa de processo independente da organização.

O documento original nunca é reescrito após assinatura. Registro de entrega efetiva e eventos são evidências independentes. Modelo definitivo depende do PDF original. Quantidade é sempre 1; campos vermelhos conhecidos não estão no assistente. A interface não oferece edição arbitrária do documento.

FaceMatch tem contrato desacoplado 1:1 com prova de vida. Sem provedor, informa indisponibilidade e não coleta dados. Não há identificação 1:N ou necessidade de Python nesta entrega. Ativação futura depende de avaliação de proteção de dados, fundamento aplicável, retenção, revogação e alternativa não biométrica.

Dois projetos Vercel compartilham o mesmo repositório. O frontend pode ser publicado sozinho em modo demo. O backend guarda estado em Postgres/Storage; pode reutilizar o cliente Supabase em memória, mas nenhum saldo, sessão, token ou limite depende da memória da função.

Testes SQL usam PostgreSQL WASM real com contratos mínimos Auth/Storage. Isso valida PLpgSQL, constraints e RLS, mas não comprova funcionamento dos serviços Supabase hospedados. O relatório VALIDATION distingue testes locais e integrações externas pendentes. O contrato OpenAPI fica em backend/src/openapi.ts, é servido em /api/openapi.json e gera docs/openapi.json por npm run api:docs.
