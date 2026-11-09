import type { Request } from "express";
import nodemailer from "nodemailer";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { config } from "../config/environment.js";
import { secretHash } from "./security.service.js";
import type { SheetSnapshot } from "./document.service.js";
export type Role =
  | "ADMIN"
  | "ALMOXARIFADO"
  | "RH"
  | "SEGURANCA"
  | "SEGURANCA_TRABALHO";

export type Context = {
  admin: SupabaseClient;
  userId: string;
  orgId: string;
  role: Role;
};

let client: SupabaseClient | undefined;

export const admin = () =>
  (client ??= createClient(
    config().SUPABASE_URL,
    config().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  ));

export const uuid = z.uuid();

export const isoDate = z.iso.date();

export const required = z.string().trim().min(1);

export const error = (message: string, status = 400) =>
  Object.assign(new Error(message), { status });

export async function context(req: Request, roles?: Role[]): Promise<Context> {
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

export async function owned<T = any>(
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

export async function getSheet(ctx: Context, id: string) {
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

export async function sendEmail(to: string, subject: string, body: string) {
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

export function assertMailer() {
  const c = config();
  if (!c.SMTP_HOST || !c.SMTP_USER || !c.SMTP_PASSWORD || !c.SMTP_FROM)
    throw error("Envio de e-mail indisponível. Configure SMTP.", 503);
}

export function dbResult(result: { data: any; error: any }): any {
  if (result.error || result.data === null)
    throw error(result.error?.message || "Falha ao salvar no banco.", 409);
  return result.data;
}

export function dbOk(result: { error: any }) {
  if (result.error)
    throw error(result.error.message || "Falha ao salvar no banco.", 409);
}

export async function audit(
  ctx: Context,
  action: string,
  entity: string,
  entityId: string,
  detail: Record<string, unknown> = {},
) {
  dbOk(
    await ctx.admin.from("audit_events").insert({
      organization_id: ctx.orgId,
      actor_id: ctx.userId,
      action,
      entity,
      entity_id: entityId,
      detail,
    }),
  );
}

export async function signingLink(raw: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw))
    throw error("Link inválido ou expirado.", 410);
  const db = admin();
  const { data } = await db
    .from("signing_links")
    .select("*")
    .eq("token_hash", secretHash(raw, config().TOKEN_PEPPER))
    .single();
  if (data?.blocked_at)
    throw error(
      "Link bloqueado por excesso de tentativas. Solicite um novo link ao RH.",
      423,
    );
  if (
    !data ||
    data.consumed_at ||
    new Date(data.expires_at).getTime() <= Date.now()
  )
    throw error("Link inválido ou expirado.", 410);
  return { db, link: data };
}

export async function checkCode(raw: string, code: string) {
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
