const item = {
  type: "object",
  required: ["variantId"],
  additionalProperties: false,
  properties: {
    variantId: { type: "string", format: "uuid" },
    quantity: { type: "integer", const: 1 },
    deliveryDate: {
      type: "string",
      format: "date",
      description:
        "Data da entrega editável por item; usa documentDate se omitida",
    },
  },
};
const methods: Record<string, Record<string, string>> = {
  "/health": { get: "Saúde pública da API" },
  "/config": { get: "Configuração pública, sem service role" },
  "/auth/profile": { get: "Perfil da sessão Supabase" },
  "/bootstrap": { get: "Dados operacionais filtrados pela organização" },
  "/products": { post: "Cadastrar equipamento (ADMIN/ALMOXARIFADO)" },
  "/products/{id}": {
    patch: "Editar equipamento",
    delete: "Desativar equipamento",
  },
  "/categories": { get: "Categorias utilizadas na organização" },
  "/variants": { post: "Cadastrar tamanho/SKU" },
  "/products/{id}/sizes": {
    put: "Definir a grade de tamanhos do equipamento; tamanho com saldo, reserva ou histórico é desativado, não removido",
  },
  "/ca/{number}": {
    get: "Consultar C.A. na base CAEPI importada (ADMIN/ALMOXARIFADO/RH/SEGURANCA_TRABALHO); 404 permite cadastro manual",
  },
  "/inventory/{id}/receive": {
    post: "Entrada idempotente com quantidade e justificativa obrigatória (idempotencyKey UUID)",
  },
  "/inventory/{id}/withdraw": {
    post: "Retirada fora de ficha, idempotente, com justificativa obrigatória",
  },
  "/inventory/{id}/adjust": {
    post: "Ajuste para mais ou para menos, idempotente, com justificativa obrigatória",
  },
  "/admin/lists/{kind}": {
    post: "Incluir cliente (ADMIN/RH), unidade de trabalho ou RAC (ADMIN). kind: clients, work-units, racs",
  },
  "/admin/lists/{kind}/{id}": {
    patch: "Renomear, desativar ou reativar item da lista (ADMIN)",
  },
  "/kits": {
    put: "Criar ou substituir o kit de EPIs de um par cliente e função (ADMIN/RH)",
  },
  "/kits/{id}": { delete: "Remover kit (ADMIN/RH)" },
  "/employees": { post: "Cadastrar colaborador (ADMIN/RH/SEGURANCA_TRABALHO)" },
  "/employees/{id}": {
    patch: "Editar colaborador",
    delete: "Registrar desligamento",
  },
  "/employees/{id}/send-verification": {
    post: "Enviar código de verificação do e-mail",
  },
  "/verify-email": { post: "Validar código com tentativas limitadas" },
  "/sheets": {
    post: "Emitir ficha imutável e reservar EPIs, sem baixa física",
  },
  "/sheets/{id}": { get: "Detalhes do documento" },
  "/sheets/{id}/pdf": { get: "PDF imutável com validação SHA-256" },
  "/sheets/{id}/xlsx": { get: "Exportar Excel" },
  "/sheets/{id}/signature-status": {
    get: "Estado independente de assinatura, reserva e entrega",
  },
  "/sheets/{id}/signing-links": {
    post: "Criar token aleatório de uso único, expiração de 24 horas",
  },
  "/sheets/{id}/manual-signature": {
    post: "Atestar assinatura presencial e local de arquivo",
  },
  "/sheets/{id}/receipt": {
    post: "Confirmar entrega física e baixar reserva atomicamente",
  },
  "/sheets/{id}/cancel": {
    post: "Cancelar ficha pendente com motivo obrigatório: libera reservas, invalida links e audita",
  },
  "/sheets/{id}/returns": {
    post: "Registrar devolução de ficha entregue, somente acréscimo: motivo (M.D.) e destino por item, assinatura presencial",
  },
  "/sheets/{id}/attachment": { post: "Anexar PDF presencial base64, até 5 MB" },
  "/sheets/{id}/attachments": {
    get: "Links autenticados temporários dos anexos",
  },
  "/sign/{token}": { get: "Validar link público sem expor dados pessoais" },
  "/sign/{token}/code": { post: "Enviar OTP ao canal previamente verificado" },
  "/sign/{token}/preview": {
    post: "Verificar OTP e obter URL do PDF exato por 60 segundos",
  },
  "/sign/{token}/identity": {
    post: "Conferir nome completo e 3 primeiros + 3 últimos dígitos do CPF (com o código do e-mail) antes de liberar o botão de assinatura. Conta tentativa em caso de erro; a quinta bloqueia o link (423). Nunca devolve o CPF",
  },
  "/sign/{token}/confirm": {
    post: "Confirmar OTP, aceite e, se houver CPF cadastrado, nome completo + 3 primeiros e 3 últimos dígitos (cpfStart, cpfEnd). Cinco erros bloqueiam o link (423). A assinatura não confirma entrega",
  },
  "/reports": { get: "Indicadores da organização" },
  "/audit": { get: "Auditoria paginada por offset e limit" },
  "/admin/members": { get: "Listar perfis (ADMIN)" },
  "/admin/members/{id}": { patch: "Alterar perfil de outro usuário" },
  "/face-match/capabilities": {
    get: "Contrato facial 1:1, indisponível sem provedor",
  },
  "/face-match/verify": { post: "Retorna 503 enquanto não configurado" },
};
const bodies: Record<string, string> = {
  "post /sheets": "IssueSheet",
  "post /sheets/{id}/returns": "SheetReturn",
  "post /inventory/{id}/receive": "InventoryMovement",
  "post /inventory/{id}/withdraw": "InventoryMovement",
  "post /inventory/{id}/adjust": "InventoryMovement",
};
export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "EPI System API",
    version: "0.3.0",
    description:
      "Autenticação via Supabase Auth. Perfis por organização. Estoque físico só baixa na entrega.",
  },
  servers: [{ url: "/api" }],
  security: [{ Bearer: [] }],
  components: {
    securitySchemes: { Bearer: { type: "http", scheme: "bearer" } },
    schemas: {
      SheetItem: item,
      SheetReturn: {
        type: "object",
        required: ["returnedOn", "note", "idempotencyKey", "items"],
        additionalProperties: false,
        properties: {
          returnedOn: { type: "string", format: "date" },
          note: { type: "string", maxLength: 500, description: "Evidência da assinatura presencial" },
          termination: { type: "boolean", default: false },
          idempotencyKey: { type: "string", format: "uuid" },
          items: {
            type: "array",
            minItems: 1,
            maxItems: 30,
            items: {
              type: "object",
              required: ["index", "reasonCode", "destination"],
              additionalProperties: false,
              properties: {
                index: { type: "integer", minimum: 0, description: "Posição do item no snapshot" },
                reasonCode: { enum: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14] },
                destination: { enum: ["RESTOCK", "DISCARD"] },
              },
            },
          },
        },
      },
      InventoryMovement: {
        type: "object",
        required: ["quantity", "reason", "idempotencyKey"],
        properties: {
          quantity: { type: "integer", minimum: -100000, maximum: 100000 },
          reason: { type: "string", minLength: 5, maxLength: 300 },
          idempotencyKey: { type: "string", format: "uuid" },
        },
      },
      IssueSheet: {
        type: "object",
        required: [
          "employeeId",
          "documentDate",
          "method",
          "idempotencyKey",
          "items",
        ],
        properties: {
          employeeId: { type: "string", format: "uuid" },
          documentDate: {
            type: "string",
            format: "date",
            description:
              "Data padrão da entrega; geração automática no servidor e Nº de Registro copiado da matrícula do colaborador",
          },
          method: { enum: ["MANUAL", "ELECTRONIC"] },
          idempotencyKey: { type: "string", format: "uuid" },
          items: {
            type: "array",
            minItems: 1,
            maxItems: 15,
            items: { $ref: "#/components/schemas/SheetItem" },
          },
        },
      },
    },
  },
  paths: Object.fromEntries(
    Object.entries(methods).map(([path, operations]) => [
      path,
      Object.fromEntries(
        Object.entries(operations).map(([method, summary]) => [
          method,
          {
            summary,
            ...(path.startsWith("/sign/") ||
            ["/health", "/config", "/verify-email"].includes(path)
              ? { security: [] }
              : {}),
            parameters: [...path.matchAll(/\{(\w+)\}/g)].map((match) => ({
              name: match[1],
              in: "path",
              required: true,
              schema: { type: "string" },
            })),
            ...(bodies[`${method} ${path}`]
              ? {
                  requestBody: {
                    required: true,
                    content: {
                      "application/json": {
                        schema: {
                          $ref: `#/components/schemas/${bodies[`${method} ${path}`]}`,
                        },
                      },
                    },
                  },
                }
              : {}),
            responses: {
              "200": { description: "Operação concluída" },
              "201": { description: "Registro criado" },
              "400": { description: "Dados inválidos" },
              "401": { description: "Sessão ou código inválido" },
              "403": { description: "Perfil não autorizado" },
              "409": { description: "Conflito de estado ou saldo" },
              "410": { description: "Link expirado ou consumido" },
              "423": { description: "Link bloqueado por tentativas de confirmação" },
              "429": { description: "Limite de tentativas" },
              "503": { description: "Integração indisponível" },
            },
          },
        ]),
      ),
    ]),
  ),
};
