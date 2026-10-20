import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import nodemailer from "nodemailer";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z, ZodError } from "zod";
import { config } from "./config.js";
import { otp, secretHash, sha256, token, unitItems } from "./security.js";
import { renderPdf, renderXlsx, type SheetSnapshot } from "./document.js";
import { openapi } from "./openapi.js";

type Role =
  | "ADMIN"
  | "ALMOXARIFADO"
  | "RH"
  | "SEGURANCA"
  | "SEGURANCA_TRABALHO";
type Context = {
  admin: SupabaseClient;
  userId: string;
  orgId: string;
  role: Role;
};
let client: SupabaseClient | undefined;
const admin = () =>
  (client ??= createClient(
    config().SUPABASE_URL,
    config().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  ));
const uuid = z.uuid();
const isoDate = z.iso.date();
const required = z.string().trim().min(1);
const error = (message: string, status = 400) =>
  Object.assign(new Error(message), { status });

async function context(req: Request, roles?: Role[]): Promise<Context> {
  const bearer = /^Bearer (.+)$/i.exec(req.header("authorization") ?? "")?.[1];
  if (!bearer) throw error("Entre com sua conta para continuar.", 401);
  const db = admin();
  const { data: userData, error: authError } = await db.auth.getUser(bearer);
  if (authError || !userData.user)
    throw error("Sessão expirada. Entre novamente.", 401);
  const orgHeader = req.header("x-organization-id");
  let query = db
    .from("memberships")
    .select("organization_id,role")
    .eq("user_id", userData.user.id);
  if (orgHeader) query = query.eq("organization_id", uuid.parse(orgHeader));
  const { data: memberships, error: memberError } = await query.limit(1);
  if (memberError || !memberships?.length)
    throw error("Seu usuário ainda não tem acesso a uma organização.", 403);
  const membership = memberships[0]!;
  if (
    roles &&
    !roles.includes(membership.role as Role) &&
    !(membership.role === "SEGURANCA_TRABALHO" && roles.includes("SEGURANCA"))
  )
    throw error("Seu perfil não permite esta ação.", 403);
  return {
    admin: db,
    userId: userData.user.id,
    orgId: membership.organization_id,
    role: membership.role as Role,
  };
}

async function owned<T = any>(
  ctx: Context,
  table: string,
  id: string,
): Promise<T> {
  const { data, error: dbError } = await ctx.admin
    .from(table)
    .select("*")
    .eq("id", uuid.parse(id))
    .eq("organization_id", ctx.orgId)
    .single();
  if (dbError || !data) throw error("Registro não encontrado.", 404);
  return data as T;
}

async function getSheet(ctx: Context, id: string) {
  if (ctx.role === "ALMOXARIFADO")
    throw error("Seu perfil não permite acessar documentos pessoais.", 403);
  return owned<{
    id: string;
    employee_id: string;
    signature_method: string;
    snapshot: SheetSnapshot;
    pdf_path: string;
    pdf_sha256: string;
    organization_id: string;
  }>(ctx, "sheets", id);
}

async function sendEmail(to: string, subject: string, body: string) {
  const c = config();
  if (!c.SMTP_HOST || !c.SMTP_USER || !c.SMTP_PASSWORD || !c.SMTP_FROM)
    throw error("Envio de e-mail indisponível. Configure SMTP.", 503);
  const mail = nodemailer.createTransport({
    host: c.SMTP_HOST,
    port: c.SMTP_PORT,
    secure: c.SMTP_PORT === 465,
    auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD },
  });
  await mail.sendMail({ from: c.SMTP_FROM, to, subject, text: body });
}

function assertMailer() {
  const c = config();
  if (!c.SMTP_HOST || !c.SMTP_USER || !c.SMTP_PASSWORD || !c.SMTP_FROM)
    throw error("Envio de e-mail indisponível. Configure SMTP.", 503);
}

function dbResult(result: { data: any; error: any }): any {
  if (result.error || result.data === null)
    throw error(result.error?.message || "Falha ao salvar no banco.", 409);
  return result.data;
}
function dbOk(result: { error: any }) {
  if (result.error)
    throw error(result.error.message || "Falha ao salvar no banco.", 409);
}
async function audit(
  ctx: Context,
  action: string,
  entity: string,
  entityId: string,
  detail: Record<string, unknown> = {},
) {
  dbOk(
    await ctx.admin
      .from("audit_events")
      .insert({
        organization_id: ctx.orgId,
        actor_id: ctx.userId,
        action,
        entity,
        entity_id: entityId,
        detail,
      }),
  );
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "8mb" }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(
  cors((req, callback) => {
    try {
      const allowed = process.env.APP_ORIGIN || "http://localhost:4200";
      callback(null, {
        origin: req.header("origin") === allowed ? allowed : false,
        methods: ["GET", "POST", "PATCH", "DELETE"],
        allowedHeaders: ["Authorization", "Content-Type", "X-Organization-Id"],
      });
    } catch (e) {
      callback(e as Error);
    }
  }),
);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/config", (_req, res) => {
  try {
    res.json({
      supabaseUrl: config().SUPABASE_URL,
      publishableKey: config().SUPABASE_PUBLISHABLE_KEY,
      faceMatchEnabled: false,
    });
  } catch {
    res
      .status(503)
      .json({
        error:
          "Ambiente real não configurado. Preencha as variáveis Supabase no backend.",
      });
  }
});
app.get("/api/openapi.json", (_req, res) => res.json(openapi));
// Limites persistidos em PostgreSQL, compartilhados por todas as funções serverless.
app.use(["/api/sign", "/api/verify-email"], async (req, res, next) => {
  const key = secretHash(
    `public:${req.ip ?? "unknown"}`,
    config().TOKEN_PEPPER,
  );
  const allowed = dbResult(
    await admin().rpc("consume_request_limit", {
      p_key: key,
      p_limit: 60,
      p_seconds: 60,
    }),
  );
  if (!allowed)
    return res
      .status(429)
      .json({ error: "Limite de requisições atingido. Aguarde um minuto." });
  next();
});
app.get("/api/face-match/capabilities", async (req, res) => {
  await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  res.json({
    available: false,
    mode: "ONE_TO_ONE",
    livenessRequired: true,
    collectsBiometrics: false,
    alternative: "VERIFIED_EMAIL_OTP",
    reason: "Nenhum provedor com prova de vida configurado.",
  });
});
app.post("/api/face-match/verify", async (req, _res) => {
  await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  throw error(
    "FaceMatch indisponível. Utilize a alternativa não biométrica.",
    503,
  );
});
app.get("/api/jobs/retention", async (req, res) => {
  const c = config();
  if (
    !c.CRON_SECRET ||
    req.header("authorization") !== `Bearer ${c.CRON_SECRET}`
  )
    throw error("Acesso negado.", 401);
  const purged = dbResult(
    await admin().rpc("purge_signature_ips", { p_days: c.IP_RETENTION_DAYS }),
  );
  res.json({ purged });
});

app.get("/api/bootstrap", async (req, res) => {
  const c = await context(req);
  const [org, employees, products, sheets, movements, audits] =
    await Promise.all([
      c.admin
        .from("organizations")
        .select("id,name")
        .eq("id", c.orgId)
        .single(),
      c.admin
        .from("employees")
        .select(c.role === "ALMOXARIFADO" ? "id,name,registration" : "*")
        .eq("organization_id", c.orgId)
        .order("name"),
      c.admin
        .from("products")
        .select("*")
        .eq("organization_id", c.orgId)
        .order("description"),
      c.admin
        .from("sheets")
        .select("id,employee_id,version,issued_at,signature_method,pdf_sha256")
        .eq("organization_id", c.orgId)
        .order("issued_at", { ascending: false })
        .limit(100),
      c.admin
        .from("stock_movements")
        .select("id,lot_id,type,quantity,created_at,reason")
        .eq("organization_id", c.orgId)
        .order("created_at", { ascending: false })
        .limit(100),
      c.admin
        .from("audit_events")
        .select(
          c.role === "ALMOXARIFADO"
            ? "id,actor_id,action,entity,entity_id,created_at"
            : "id,actor_id,action,entity,entity_id,detail,created_at",
        )
        .eq("organization_id", c.orgId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
  for (const result of [org, employees, products, sheets, movements, audits])
    if (result.error) throw error("Falha ao carregar dados.", 500);
  const productIds = (products.data ?? []).map((p) => p.id);
  const variants = productIds.length
    ? dbResult(
        await c.admin.from("variants").select("*").in("product_id", productIds),
      )
    : [];
  const variantIds = variants.map((v: any) => v.id);
  const lots = variantIds.length
    ? dbResult(
        await c.admin.from("lots").select("*").in("variant_id", variantIds),
      )
    : [];
  const sheetIds = (sheets.data ?? []).map((s) => s.id);
  const states = sheetIds.length
    ? dbResult(
        await c.admin.from("sheet_state").select("*").in("sheet_id", sheetIds),
      )
    : [];
  res.json({
    organization: org.data,
    role: c.role,
    employees: employees.data,
    products: products.data,
    variants,
    lots,
    sheets: sheets.data,
    states,
    movements: movements.data,
    audits: audits.data,
  });
});

const productSchema = z.object({
  category: required.max(80),
  description: required.max(180),
  ca: z.string().trim().max(50).nullable().optional(),
  brand: z.string().trim().max(100).default(""),
  model: z.string().trim().max(100).default(""),
  riskCode: z.string().trim().max(30).default(""),
  caExpiresAt: isoDate.nullable().optional(),
  active: z.boolean().optional(),
  photoUrl: z
    .url()
    .regex(/^https:\/\//)
    .nullable()
    .optional()
    .or(z.literal("")),
  unit: z.literal("UN").default("UN"),
  usefulLifeDays: z.number().int().positive().max(36500).nullable().optional(),
});
app.post("/api/products", async (req, res) => {
  const c = await context(req, ["ADMIN", "ALMOXARIFADO"]);
  const body = productSchema.parse(req.body);
  const data = dbResult(
    await c.admin
      .from("products")
      .insert({
        organization_id: c.orgId,
        category: body.category,
        description: body.description,
        ca: body.ca || null,
        brand: body.brand,
        model: body.model,
        risk_code: body.riskCode,
        ca_expires_at: body.caExpiresAt || null,
        photo_url: body.photoUrl || null,
        unit: body.unit,
        useful_life_days: body.usefulLifeDays || null,
      })
      .select()
      .single(),
  );
  await audit(c, "PRODUCT_CREATED", "product", data.id);
  res.status(201).json(data);
});
app.patch("/api/products/:id", async (req, res) => {
  const c = await context(req, ["ADMIN", "ALMOXARIFADO"]);
  const body = productSchema.partial().parse(req.body);
  await owned(c, "products", req.params.id);
  const map = {
    category: "category",
    description: "description",
    ca: "ca",
    brand: "brand",
    model: "model",
    riskCode: "risk_code",
    caExpiresAt: "ca_expires_at",
    active: "active",
    photoUrl: "photo_url",
    unit: "unit",
    usefulLifeDays: "useful_life_days",
  } as const;
  const payload: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(map))
    if ((body as any)[key] !== undefined) {
      const value = (body as any)[key];
      payload[column] = ["ca", "caExpiresAt", "photoUrl"].includes(key)
        ? value || null
        : value;
    }
  const data = dbResult(
    await c.admin
      .from("products")
      .update(payload)
      .eq("id", req.params.id)
      .eq("organization_id", c.orgId)
      .select()
      .single(),
  );
  await audit(
    c,
    "PRODUCT_UPDATED",
    "product",
    data.id,
    Object.keys(payload).reduce((keys, key) => ({ ...keys, [key]: true }), {}),
  );
  res.json(data);
});
app.delete("/api/products/:id", async (req, res) => {
  const c = await context(req, ["ADMIN", "ALMOXARIFADO"]);
  const product = await owned<any>(c, "products", req.params.id);
  if (product.active)
    dbOk(
      await c.admin
        .from("products")
        .update({ active: false })
        .eq("id", product.id)
        .eq("organization_id", c.orgId),
    );
  await audit(c, "PRODUCT_DEACTIVATED", "product", product.id);
  res.status(204).end();
});
app.post("/api/variants", async (req, res) => {
  const c = await context(req, ["ADMIN", "ALMOXARIFADO"]);
  const body = z
    .object({
      productId: uuid,
      size: required.max(30),
      sku: required.max(80),
      minimumStock: z.number().int().min(0),
    })
    .parse(req.body);
  await owned(c, "products", body.productId);
  const data = dbResult(
    await c.admin
      .from("variants")
      .insert({
        product_id: body.productId,
        size: body.size,
        sku: body.sku,
        minimum_stock: body.minimumStock,
      })
      .select()
      .single(),
  );
  await audit(c, "VARIANT_CREATED", "variant", data.id);
  res.status(201).json(data);
});
app.post("/api/lots", async (req, res) => {
  const c = await context(req, ["ADMIN", "ALMOXARIFADO"]);
  const body = z
    .object({
      variantId: uuid,
      batchCode: required.max(80),
      supplier: z.string().trim().max(160).default(""),
      receivedAt: isoDate,
      expiresAt: isoDate.nullable().optional(),
      unitCost: z.number().nonnegative().max(9999999999).default(0),
      location: z.string().trim().max(120).default(""),
      condition: z.enum(["NOVO", "BOM", "AVARIADO"]).default("NOVO"),
    })
    .parse(req.body);
  const variant = dbResult(
    await c.admin
      .from("variants")
      .select("product_id")
      .eq("id", body.variantId)
      .single(),
  );
  await owned(c, "products", variant.product_id);
  const data = dbResult(
    await c.admin
      .from("lots")
      .insert({
        variant_id: body.variantId,
        batch_code: body.batchCode,
        supplier: body.supplier,
        received_at: body.receivedAt,
        expires_at: body.expiresAt || null,
        unit_cost: body.unitCost,
        location: body.location,
        condition: body.condition,
      })
      .select()
      .single(),
  );
  await audit(c, "LOT_CREATED", "lot", data.id);
  res.status(201).json(data);
});
app.post("/api/lots/:id/receive", async (req, res) => {
  const c = await context(req, ["ADMIN", "ALMOXARIFADO"]);
  const body = z
    .object({
      quantity: z.number().int().positive().max(100000),
      reason: z.string().max(300).default(""),
      idempotencyKey: uuid,
    })
    .parse(req.body);
  const data = dbResult(
    await c.admin.rpc("operate_stock", {
      p_org: c.orgId,
      p_actor: c.userId,
      p_lot: uuid.parse(req.params.id),
      p_quantity: body.quantity,
      p_reason: body.reason,
      p_adjust: false,
      p_key: body.idempotencyKey,
    }),
  );
  res.json({ stockQuantity: data });
});
app.post("/api/lots/:id/adjust", async (req, res) => {
  const c = await context(req, ["ADMIN", "ALMOXARIFADO"]);
  const b = z
    .object({
      quantity: z
        .number()
        .int()
        .min(-100000)
        .max(100000)
        .refine((v) => v !== 0),
      reason: required.min(5).max(300),
      idempotencyKey: uuid,
    })
    .parse(req.body);
  const stock = dbResult(
    await c.admin.rpc("operate_stock", {
      p_org: c.orgId,
      p_actor: c.userId,
      p_lot: uuid.parse(req.params.id),
      p_quantity: b.quantity,
      p_reason: b.reason,
      p_adjust: true,
      p_key: b.idempotencyKey,
    }),
  );
  res.json({ stockQuantity: stock });
});

const employeeSchema = z.object({
  name: required.min(2).max(160),
  registration: required.max(50),
  department: z.string().trim().max(100).default(""),
  jobTitle: required.max(120),
  admissionDate: isoDate,
  terminationDate: isoDate.nullable().optional(),
  personalEmail: z.email().nullable().optional(),
  phone: z.string().max(30).default(""),
  workUnit: z.string().trim().max(120).default(""),
  facialOptIn: z.boolean().default(false),
  cpf: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{11}$/))
    .nullable()
    .optional(),
});
app.post("/api/employees", async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  const body = employeeSchema.parse(req.body);
  const data = dbResult(
    await c.admin
      .from("employees")
      .insert({
        organization_id: c.orgId,
        name: body.name,
        registration: body.registration,
        department: body.department,
        job_title: body.jobTitle,
        admission_date: body.admissionDate,
        termination_date: body.terminationDate || null,
        personal_email: body.personalEmail || null,
        phone: body.phone,
        work_unit: body.workUnit,
        facial_opt_in: body.facialOptIn,
        cpf: body.cpf || null,
      })
      .select()
      .single(),
  );
  await audit(c, "EMPLOYEE_CREATED", "employee", data.id);
  res.status(201).json(data);
});
app.patch("/api/employees/:id", async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  const body = employeeSchema.partial().parse(req.body);
  await owned(c, "employees", req.params.id);
  const payload: Record<string, unknown> = {};
  const map = {
    name: "name",
    registration: "registration",
    department: "department",
    jobTitle: "job_title",
    admissionDate: "admission_date",
    terminationDate: "termination_date",
    personalEmail: "personal_email",
    phone: "phone",
    workUnit: "work_unit",
    facialOptIn: "facial_opt_in",
    cpf: "cpf",
  } as const;
  for (const [key, column] of Object.entries(map))
    if ((body as any)[key] !== undefined) payload[column] = (body as any)[key];
  if ("personal_email" in payload) payload["email_verified_at"] = null;
  const data = dbResult(
    await c.admin
      .from("employees")
      .update(payload)
      .eq("id", req.params.id)
      .eq("organization_id", c.orgId)
      .select()
      .single(),
  );
  if ("personal_email" in payload)
    dbOk(
      await c.admin
        .from("email_verifications")
        .delete()
        .eq("employee_id", req.params.id),
    );
  await audit(
    c,
    "EMPLOYEE_UPDATED",
    "employee",
    data.id,
    Object.keys(payload).reduce((keys, key) => ({ ...keys, [key]: true }), {}),
  );
  res.json(data);
});
app.delete("/api/employees/:id", async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  const employee = await owned<any>(c, "employees", req.params.id);
  const terminationDate =
    employee.termination_date ||
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date(),
    );
  if (!employee.termination_date)
    dbOk(
      await c.admin
        .from("employees")
        .update({ termination_date: terminationDate })
        .eq("id", employee.id)
        .eq("organization_id", c.orgId),
    );
  await audit(c, "EMPLOYEE_TERMINATED", "employee", employee.id, {
    terminationDate,
  });
  res.status(204).end();
});
app.post("/api/employees/:id/send-verification", async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  const employee = await owned<{
    id: string;
    personal_email: string | null;
    email_verified_at: string | null;
  }>(c, "employees", req.params.id);
  if (!employee.personal_email)
    throw error("Cadastre o e-mail pessoal do colaborador.");
  if (employee.email_verified_at) throw error("E-mail já verificado.");
  const allowed = dbResult(
    await c.admin.rpc("consume_request_limit", {
      p_key: secretHash(`verify:${employee.id}`, config().TOKEN_PEPPER),
      p_limit: 3,
      p_seconds: 3600,
    }),
  );
  if (!allowed)
    throw error(
      "Limite de envios de verificação atingido. Aguarde uma hora.",
      429,
    );
  assertMailer();
  const code = otp();
  dbOk(
    await c.admin
      .from("email_verifications")
      .upsert({
        employee_id: employee.id,
        email_address: employee.personal_email,
        code_hash: secretHash(code, config().TOKEN_PEPPER),
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        attempts: 0,
      }),
  );
  await sendEmail(
    employee.personal_email,
    "Confirmação de e-mail - EPI ERP",
    `Seu código de confirmação é ${code}. Validade: 10 minutos. Não compartilhe.`,
  );
  await audit(c, "EMPLOYEE_EMAIL_VERIFICATION_SENT", "employee", employee.id);
  res.json({ sent: true });
});
app.post("/api/verify-email", async (req, res) => {
  const body = z
    .object({ employeeId: uuid, code: z.string().regex(/^\d{6}$/) })
    .parse(req.body);
  const verified = dbResult(
    await admin().rpc("verify_employee_email", {
      p_employee: body.employeeId,
      p_code_hash: secretHash(body.code, config().TOKEN_PEPPER),
    }),
  );
  if (!verified) throw error("Código inválido, expirado ou bloqueado.", 401);
  res.json({ verified: true });
});

app.post("/api/sheets", async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  const body = z
    .object({
      employeeId: uuid,
      documentDate: isoDate,
      method: z.enum(["MANUAL", "ELECTRONIC"]),
      idempotencyKey: uuid,
      items: z
        .array(
          z.object({
            variantId: uuid,
            lotId: uuid,
            quantity: z.literal(1).optional(),
            risk: z.string().trim().max(30).optional(),
          }),
        )
        .min(1)
        .max(15),
    })
    .parse(req.body);
  const employee = await owned<any>(c, "employees", body.employeeId);
  if (employee.termination_date) throw error("Colaborador inativo.");
  const requested = unitItems(body.items);
  const now = new Date().toISOString();
  const items: SheetSnapshot["items"] = [];
  for (const item of requested) {
    const lot = dbResult(
      await c.admin
        .from("lots")
        .select("id,variant_id,batch_code,stock_quantity,expires_at")
        .eq("id", item.lot_id)
        .single(),
    );
    const variant = dbResult(
      await c.admin
        .from("variants")
        .select("id,product_id,size")
        .eq("id", item.variant_id)
        .single(),
    );
    const product = await owned<any>(c, "products", variant.product_id);
    if (
      lot.variant_id !== variant.id ||
      lot.stock_quantity < 1 ||
      (lot.expires_at && lot.expires_at < now.slice(0, 10)) ||
      (product.ca_expires_at && product.ca_expires_at < now.slice(0, 10)) ||
      !product.active
    )
      throw error("Escolha um lote ativo com estoque e validade.");
    items.push({
      date: body.documentDate,
      description: product.description,
      ca: product.ca ?? "",
      brand: product.brand,
      risk: item.risk || product.risk_code,
      size: variant.size,
      lot: lot.batch_code,
      variantId: variant.id,
      lotId: lot.id,
      quantity: 1,
    });
  }
  const organization = dbResult(
    await c.admin
      .from("organizations")
      .select("name")
      .eq("id", c.orgId)
      .single(),
  );
  const snapshot: SheetSnapshot = {
    employee: {
      name: employee.name,
      registration: employee.registration,
      jobTitle: employee.job_title,
      department: employee.department,
      admissionDate: employee.admission_date,
      terminationDate: employee.termination_date,
    },
    issuedAt: now,
    documentDate: body.documentDate,
    method: body.method,
    items,
    template: "PROVISIONAL_FROM_IMAGE_V1",
    requestKey: body.idempotencyKey,
    organizationName: organization.name,
  };
  const bytes = await renderPdf(snapshot);
  const pdfPath = `${c.orgId}/${crypto.randomUUID()}.pdf`;
  dbResult(
    await c.admin.storage
      .from("epi-sheets")
      .upload(pdfPath, bytes, {
        contentType: "application/pdf",
        upsert: false,
      }),
  );
  try {
    const sheetId = dbResult(
      await c.admin.rpc("issue_sheet", {
        p_org: c.orgId,
        p_actor: c.userId,
        p_employee: body.employeeId,
        p_snapshot: snapshot,
        p_snapshot_hash: sha256(JSON.stringify(snapshot)),
        p_pdf_hash: sha256(bytes),
        p_pdf_path: pdfPath,
        p_method: body.method,
        p_items: requested,
      }),
    );
    const saved = await getSheet(c, sheetId);
    if (saved.pdf_path !== pdfPath)
      await c.admin.storage.from("epi-sheets").remove([pdfPath]);
    res
      .status(201)
      .json({ id: sheetId, pdfSha256: saved.pdf_sha256, method: body.method });
  } catch (e) {
    const { data: committed } = await c.admin
      .from("sheets")
      .select("id,pdf_sha256")
      .eq("pdf_path", pdfPath)
      .eq("organization_id", c.orgId)
      .maybeSingle();
    if (committed)
      return res
        .status(201)
        .json({
          id: committed.id,
          pdfSha256: committed.pdf_sha256,
          method: body.method,
        });
    await c.admin.storage.from("epi-sheets").remove([pdfPath]);
    throw e;
  }
});
app.get("/api/sheets/:id/pdf", async (req, res) => {
  const c = await context(req);
  const sheet = await getSheet(c, req.params.id);
  const file = dbResult(
    await c.admin.storage.from("epi-sheets").download(sheet.pdf_path),
  );
  const bytes = Buffer.from(await file.arrayBuffer());
  if (sha256(bytes) !== sheet.pdf_sha256)
    throw error("Integridade do documento comprometida.", 500);
  res
    .type("application/pdf")
    .set("Content-Disposition", `attachment; filename="ficha-${sheet.id}.pdf"`)
    .send(bytes);
});
app.get("/api/sheets/:id/xlsx", async (req, res) => {
  const c = await context(req);
  const sheet = await getSheet(c, req.params.id);
  const bytes = await renderXlsx(sheet.snapshot);
  res
    .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .set("Content-Disposition", `attachment; filename="ficha-${sheet.id}.xlsx"`)
    .send(bytes);
});
app.post("/api/sheets/:id/signing-links", async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  const sheet = await getSheet(c, req.params.id);
  if (sheet.signature_method !== "ELECTRONIC")
    throw error("Ficha configurada para assinatura manual.");
  const employee = await owned<any>(c, "employees", sheet.employee_id);
  if (!employee.personal_email || !employee.email_verified_at)
    throw error("Verifique o e-mail pessoal antes de criar o link.");
  const state = dbResult(
    await c.admin
      .from("sheet_state")
      .select("signature_status")
      .eq("sheet_id", sheet.id)
      .single(),
  );
  if (state.signature_status !== "PENDING")
    throw error("Esta ficha já foi assinada.");
  const raw = token();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  dbOk(
    await c.admin
      .from("signing_links")
      .insert({
        sheet_id: sheet.id,
        token_hash: secretHash(raw, config().TOKEN_PEPPER),
        expires_at: expiresAt,
        recipient_email: employee.personal_email,
        recipient_verified_at: employee.email_verified_at,
      }),
  );
  await audit(c, "SIGNING_LINK_CREATED", "sheet", sheet.id, {
    expires_at: expiresAt,
  });
  res
    .status(201)
    .json({
      url: `${config().APP_ORIGIN}/assinar/${raw}`,
      expiresAt,
      delivery: "Envie o link por canal diferente do e-mail do código.",
    });
});

async function signingLink(raw: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw))
    throw error("Link inválido ou expirado.", 410);
  const db = admin();
  const { data } = await db
    .from("signing_links")
    .select("*")
    .eq("token_hash", secretHash(raw, config().TOKEN_PEPPER))
    .single();
  if (
    !data ||
    data.consumed_at ||
    new Date(data.expires_at).getTime() <= Date.now()
  )
    throw error("Link inválido ou expirado.", 410);
  return { db, link: data };
}
app.get("/api/sign/:token", async (req, res) => {
  await signingLink(req.params.token);
  res.json({
    pending: true,
    message:
      "Solicite o código enviado ao e-mail verificado para visualizar e assinar a ficha.",
  });
});
app.post("/api/sign/:token/code", async (req, res) => {
  const { db, link } = await signingLink(req.params.token);
  if (link.attempts >= 5) throw error("Limite de tentativas atingido.", 429);
  if (link.otp_send_count >= 3) throw error("Limite de envios atingido.", 429);
  if (
    link.otp_sent_at &&
    Date.now() - new Date(link.otp_sent_at).getTime() < 60_000
  )
    throw error("Aguarde 60 segundos antes de reenviar.", 429);
  const sheet = dbResult(
    await db
      .from("sheets")
      .select("employee_id")
      .eq("id", link.sheet_id)
      .single(),
  );
  const employee = dbResult(
    await db
      .from("employees")
      .select("personal_email,email_verified_at")
      .eq("id", sheet.employee_id)
      .single(),
  );
  if (
    !employee.email_verified_at ||
    !employee.personal_email ||
    employee.personal_email !== link.recipient_email ||
    employee.email_verified_at !== link.recipient_verified_at
  )
    throw error("Canal verificado mudou. Gere um novo link.", 403);
  assertMailer();
  const code = otp();
  dbResult(
    await db
      .from("signing_links")
      .update({
        otp_hash: secretHash(code, config().TOKEN_PEPPER),
        otp_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        otp_sent_at: new Date().toISOString(),
        otp_send_count: link.otp_send_count + 1,
        previewed_at: null,
      })
      .eq("id", link.id)
      .eq("otp_send_count", link.otp_send_count)
      .is("consumed_at", null)
      .select("id")
      .single(),
  );
  await sendEmail(
    employee.personal_email,
    "Código para assinatura - EPI ERP",
    `Seu código para visualizar e assinar a ficha de EPI é ${code}. Validade: 10 minutos. Se não solicitou, ignore.`,
  );
  res.json({
    sent: true,
    destination: employee.personal_email.replace(/^(.{2}).*(@.*)$/, "$1***$2"),
  });
});
async function checkCode(raw: string, code: string) {
  const { db, link } = await signingLink(raw);
  const valid = dbResult(
    await db.rpc("verify_signing_code", {
      p_link: link.id,
      p_otp_hash: secretHash(code, config().TOKEN_PEPPER),
    }),
  );
  if (!valid) throw error("Código inválido, expirado ou bloqueado.", 401);
  return { db, link };
}
app.post("/api/sign/:token/preview", async (req, res) => {
  const { code } = z
    .object({ code: z.string().regex(/^\d{6}$/) })
    .parse(req.body);
  const { db, link } = await checkCode(req.params.token, code);
  const sheet = dbResult(
    await db
      .from("sheets")
      .select("pdf_path,pdf_sha256")
      .eq("id", link.sheet_id)
      .single(),
  );
  const signed = dbResult(
    await db.storage.from("epi-sheets").createSignedUrl(sheet.pdf_path, 60),
  );
  dbOk(
    await db
      .from("signing_links")
      .update({ previewed_at: new Date().toISOString() })
      .eq("id", link.id)
      .is("consumed_at", null),
  );
  res.json({
    documentUrl: signed.signedUrl,
    sha256: sheet.pdf_sha256,
    expiresInSeconds: 60,
    terms:
      "Declaro que li o documento exato identificado pelo SHA-256 acima e concordo em assinar eletronicamente. A assinatura não confirma, por si só, a entrega física.",
  });
});
app.post("/api/sign/:token/confirm", async (req, res) => {
  const body = z
    .object({
      code: z.string().regex(/^\d{6}$/),
      acceptedTerms: z.literal(true),
    })
    .parse(req.body);
  const { db, link } = await checkCode(req.params.token, body.code);
  const ip = req.ip && /^[0-9a-fA-F:.]+$/.test(req.ip) ? req.ip : null;
  const sheetId = dbResult(
    await db.rpc("complete_signature", {
      p_link: link.id,
      p_otp_hash: secretHash(body.code, config().TOKEN_PEPPER),
      p_ip: ip,
      p_agent: req.header("user-agent") ?? "",
    }),
  );
  res.json({
    signed: true,
    sheetId,
    received: false,
    message:
      "Assinatura registrada. O recebimento físico continua pendente de confirmação separada.",
  });
});
app.post("/api/sheets/:id/receipt", async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA", "ALMOXARIFADO"]);
  const sheet = await owned<any>(c, "sheets", req.params.id);
  const body = z
    .object({
      method: z.enum(["IN_PERSON", "EMPLOYEE_DECLARATION"]),
      note: required.max(500),
    })
    .parse(req.body);
  dbOk(
    await c.admin.rpc("confirm_receipt", {
      p_org: c.orgId,
      p_actor: c.userId,
      p_sheet: sheet.id,
      p_method: body.method,
      p_note: body.note,
    }),
  );
  res.json({ received: true });
});
app.post("/api/sheets/:id/manual-signature", async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  const sheet = await getSheet(c, req.params.id);
  if (sheet.signature_method !== "MANUAL")
    throw error("Ficha configurada para assinatura eletrônica.");
  const body = z.object({ note: required.max(500) }).parse(req.body);
  dbOk(
    await c.admin.rpc("record_manual_signature", {
      p_org: c.orgId,
      p_actor: c.userId,
      p_sheet: sheet.id,
      p_note: body.note,
    }),
  );
  res.json({ signed: true, received: false });
});

app.get("/api/sheets/:id", async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  res.json(await getSheet(c, req.params.id));
});
app.get("/api/sheets/:id/signature-status", async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  await getSheet(c, req.params.id);
  res.json(
    dbResult(
      await c.admin
        .from("sheet_state")
        .select("*")
        .eq("sheet_id", req.params.id)
        .single(),
    ),
  );
});
app.post("/api/sheets/:id/cancel", async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  await getSheet(c, req.params.id);
  const b = z.object({ note: required.min(5).max(500) }).parse(req.body);
  dbOk(
    await c.admin.rpc("cancel_reservation", {
      p_org: c.orgId,
      p_actor: c.userId,
      p_sheet: req.params.id,
      p_note: b.note,
    }),
  );
  res.json({ cancelled: true });
});
app.post("/api/sheets/:id/attachment", async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  const sheet = await getSheet(c, req.params.id);
  if (sheet.signature_method !== "MANUAL")
    throw error("Anexo disponível para documentos presenciais.");
  const { content } = z
    .object({
      content: z
        .string()
        .max(7000000)
        .regex(/^[A-Za-z0-9+/]*={0,2}$/),
    })
    .parse(req.body);
  const bytes = Buffer.from(content, "base64");
  if (bytes.length > 5242880 || bytes.subarray(0, 5).toString() !== "%PDF-")
    throw error("Use um PDF de até 5 MB.");
  const path = `${c.orgId}/${sheet.id}/${crypto.randomUUID()}.pdf`;
  dbResult(
    await c.admin.storage
      .from("epi-attachments")
      .upload(path, bytes, { contentType: "application/pdf", upsert: false }),
  );
  try {
    dbOk(
      await c.admin
        .from("document_attachments")
        .insert({
          organization_id: c.orgId,
          sheet_id: sheet.id,
          storage_path: path,
          sha256: sha256(bytes),
          uploaded_by: c.userId,
        }),
    );
    await audit(c, "MANUAL_DOCUMENT_ATTACHED", "sheet", sheet.id, {
      sha256: sha256(bytes),
    });
  } catch (e) {
    await c.admin.storage.from("epi-attachments").remove([path]);
    throw e;
  }
  res.status(201).json({ attached: true });
});
app.get("/api/sheets/:id/attachments", async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  await getSheet(c, req.params.id);
  const rows = dbResult(
    await c.admin
      .from("document_attachments")
      .select("*")
      .eq("sheet_id", req.params.id)
      .eq("organization_id", c.orgId),
  );
  res.json(
    await Promise.all(
      rows.map(async (a: any) => ({
        ...a,
        url: dbResult(
          await c.admin.storage
            .from("epi-attachments")
            .createSignedUrl(a.storage_path, 60),
        ).signedUrl,
      })),
    ),
  );
});
app.get("/api/audit", async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  const { offset, limit } = z
    .object({
      offset: z.coerce.number().int().nonnegative().default(0),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .parse(req.query);
  res.json(
    dbResult(
      await c.admin
        .from("audit_events")
        .select("*")
        .eq("organization_id", c.orgId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
    ),
  );
});
app.get("/api/admin/members", async (req, res) => {
  const c = await context(req, ["ADMIN"]);
  res.json(
    dbResult(
      await c.admin
        .from("memberships")
        .select("user_id,role,created_at")
        .eq("organization_id", c.orgId),
    ),
  );
});
app.patch("/api/admin/members/:id", async (req, res) => {
  const c = await context(req, ["ADMIN"]);
  const { role } = z
    .object({
      role: z.enum(["ADMIN", "ALMOXARIFADO", "RH", "SEGURANCA_TRABALHO"]),
    })
    .parse(req.body);
  dbOk(
    await c.admin.rpc("change_member_role", {
      p_org: c.orgId,
      p_actor: c.userId,
      p_user: uuid.parse(req.params.id),
      p_role: role,
    }),
  );
  res.json({ updated: true });
});
app.get("/api/auth/profile", async (req, res) => {
  const c = await context(req);
  res.json({ userId: c.userId, organizationId: c.orgId, role: c.role });
});
app.get("/api/reports", async (req, res) => {
  const c = await context(req);
  const movements = dbResult(
    await c.admin
      .from("stock_movements")
      .select("type,quantity,created_at")
      .eq("organization_id", c.orgId)
      .order("created_at", { ascending: false })
      .limit(1000),
  );
  res.json({
    scope: "últimas 1000 movimentações",
    entries: movements
      .filter((m: any) => m.quantity > 0)
      .reduce((n: number, m: any) => n + m.quantity, 0),
    exits: -movements
      .filter((m: any) => m.quantity < 0)
      .reduce((n: number, m: any) => n + m.quantity, 0),
  });
});
app.get("/api/categories", async (req, res) => {
  const c = await context(req);
  const rows = dbResult(
    await c.admin
      .from("products")
      .select("category")
      .eq("organization_id", c.orgId),
  );
  res.json([...new Set(rows.map((p: any) => p.category))]);
});
app.use((_req, res) =>
  res.status(404).json({ error: "Endpoint não encontrado." }),
);

app.use((err: unknown, _req: Request, res: Response, _next: Function) => {
  if (err instanceof ZodError)
    return res
      .status(400)
      .json({ error: "Dados inválidos.", issues: err.issues });
  const e = err as { status?: number; message?: string };
  if (!e.status || e.status >= 500) console.error(e);
  res
    .status(e.status || 500)
    .json({ error: e.status ? e.message : "Falha interna. Tente novamente." });
});
export default app;
