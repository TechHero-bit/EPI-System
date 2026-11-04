import { RequestHandler } from "express";
import { z } from "zod";
import { config } from "../config/environment.js";
import {
  admin,
  uuid,
  error,
  context,
  owned,
  sendEmail,
  assertMailer,
  dbResult,
  dbOk,
  audit,
} from "../services/portal.service.js";
import { otp, secretHash, token } from "../services/security.service.js";

import { employeeSchema } from "../schemas/employee.schema.js";
export const postemployees: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};

export const patchemployeesId: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};

export const deleteemployeesId: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};

export const postemployeesIdSendVerification: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
    await c.admin.from("email_verifications").upsert({
      employee_id: employee.id,
      email_address: employee.personal_email,
      code_hash: secretHash(code, config().TOKEN_PEPPER),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      attempts: 0,
    }),
  );
  await sendEmail(
    employee.personal_email,
    "Confirmação de e-mail - EPI - Controle de Proteção",
    `Seu código de confirmação é ${code}. Validade: 10 minutos. Não compartilhe.`,
  );
  await audit(c, "EMPLOYEE_EMAIL_VERIFICATION_SENT", "employee", employee.id);
  res.json({ sent: true });
};

export const postverifyEmail: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};
