import { RequestHandler } from "express";

import { config } from "../config/environment.js";
import { admin, error, context, dbResult } from "../services/portal.service.js";
import { token } from "../services/security.service.js";

import { openapi } from "../config/openapi.js";

export const gethealth: RequestHandler<{ id: string; token: string }> = (
  _req,
  res,
) => res.json({ status: "ok" });

export const getconfig: RequestHandler<{ id: string; token: string }> = (
  _req,
  res,
) => {
  try {
    res.json({
      supabaseUrl: config().SUPABASE_URL,
      publishableKey: config().SUPABASE_PUBLISHABLE_KEY,
      faceMatchEnabled: false,
    });
  } catch {
    res.status(503).json({
      error:
        "Ambiente real não configurado. Preencha as variáveis Supabase no backend.",
    });
  }
};

export const getopenapiJson: RequestHandler<{ id: string; token: string }> = (
  _req,
  res,
) => res.json(openapi);

export const getfaceMatchCapabilities: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
  await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  res.json({
    available: false,
    mode: "ONE_TO_ONE",
    livenessRequired: true,
    collectsBiometrics: false,
    alternative: "VERIFIED_EMAIL_OTP",
    reason: "Nenhum provedor com prova de vida configurado.",
  });
};

export const postfaceMatchVerify: RequestHandler<{
  id: string;
  token: string;
}> = async (req, _res) => {
  await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  throw error(
    "FaceMatch indisponível. Utilize a alternativa não biométrica.",
    503,
  );
};

export const getjobsRetention: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};

export const getbootstrap: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
        .select(
          "id,employee_id,version,employee_registration,issued_at,signature_method,pdf_sha256",
        )
        .eq("organization_id", c.orgId)
        .order("issued_at", { ascending: false })
        .limit(100),
      c.admin
        .from("stock_movements")
        .select("id,variant_id,type,quantity,created_at,reason")
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
  const inventory = variantIds.length
    ? dbResult(
        await c.admin
          .from("inventory_stock")
          .select("*")
          .eq("organization_id", c.orgId)
          .in("id", variantIds),
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
    inventory,
    sheets: sheets.data,
    states,
    movements: movements.data,
    audits: audits.data,
  });
};
