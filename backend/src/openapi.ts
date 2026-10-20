const item = {
  type: "object",
  required: ["variantId", "lotId"],
  properties: {
    variantId: { type: "string", format: "uuid" },
    lotId: { type: "string", format: "uuid" },
    quantity: { type: "integer", const: 1 },
    risk: { type: "string", maxLength: 30 },
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
  "/lots": { post: "Cadastrar lote" },
  "/lots/{id}/receive": {
    post: "Entrada idempotente, exige idempotencyKey UUID",
  },
  "/lots/{id}/adjust": { post: "Ajuste idempotente com justificativa" },
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
  "/sheets/{id}/cancel": { post: "Cancelar reserva e invalidar links" },
  "/sheets/{id}/attachment": { post: "Anexar PDF presencial base64, até 5 MB" },
  "/sheets/{id}/attachments": {
    get: "Links autenticados temporários dos anexos",
  },
  "/sign/{token}": { get: "Validar link público sem expor dados pessoais" },
  "/sign/{token}/code": { post: "Enviar OTP ao canal previamente verificado" },
  "/sign/{token}/preview": {
    post: "Verificar OTP e obter URL do PDF exato por 60 segundos",
  },
  "/sign/{token}/confirm": {
    post: "Confirmar OTP e aceite; assinatura não confirma entrega",
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
export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "EPI System API",
    version: "0.2.0",
    description:
      "Autenticação via Supabase Auth. Perfis por organização. Estoque físico só baixa na entrega.",
  },
  servers: [{ url: "/api" }],
  security: [{ Bearer: [] }],
  components: {
    securitySchemes: { Bearer: { type: "http", scheme: "bearer" } },
    schemas: {
      SheetItem: item,
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
          documentDate: { type: "string", format: "date" },
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
            ...(path === "/sheets" && method === "post"
              ? {
                  requestBody: {
                    required: true,
                    content: {
                      "application/json": {
                        schema: { $ref: "#/components/schemas/IssueSheet" },
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
              "429": { description: "Limite de tentativas" },
              "503": { description: "Integração indisponível" },
            },
          },
        ]),
      ),
    ]),
  ),
};
