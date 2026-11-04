import { RequestHandler } from "express";
import { z } from "zod";
import {
  SIGNATURE_TERMS,
  SIGNATURE_TERMS_VERSION,
} from "../../../contracts/signature.mjs";
import { config } from "../config/environment.js";
import {
  error,
  sendEmail,
  assertMailer,
  dbResult,
  dbOk,
  signingLink,
  checkCode,
} from "../services/portal.service.js";
import {
  otp,
  secretHash,
  sha256,
  token,
} from "../services/security.service.js";

export const getsignToken: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
  await signingLink(req.params.token);
  res.json({
    pending: true,
    message:
      "Solicite o código enviado ao e-mail verificado para visualizar e assinar a ficha.",
  });
};

export const postsignTokenCode: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
    "Código para assinatura - EPI - Controle de Proteção",
    `Seu código para visualizar e assinar a ficha de EPI é ${code}. Validade: 10 minutos. Se não solicitou, ignore.`,
  );
  res.json({
    sent: true,
    destination: employee.personal_email.replace(/^(.{2}).*(@.*)$/, "$1***$2"),
  });
};

export const postsignTokenPreview: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
  const { code } = z
    .object({ code: z.string().regex(/^\d{6}$/) })
    .parse(req.body);
  const { db, link } = await checkCode(req.params.token, code);
  const sheet = dbResult(
    await db
      .from("sheets")
      .select("pdf_path,pdf_sha256,snapshot")
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
    signerName: sheet.snapshot.employee.name,
    terms: SIGNATURE_TERMS,
    termsVersion: SIGNATURE_TERMS_VERSION,
  });
};

export const postsignTokenConfirm: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
  const body = z
    .object({
      code: z.string().regex(/^\d{6}$/),
      acceptedTerms: z.literal(true),
      signerName: z.string().trim().min(2).max(180),
      signatureStyle: z.enum(["classic", "handwritten", "elegant"]),
      termsVersion: z.literal(SIGNATURE_TERMS_VERSION),
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
      p_signer_name: body.signerName,
      p_signature_style: body.signatureStyle,
      p_terms_version: body.termsVersion,
      p_terms_text: SIGNATURE_TERMS,
      p_accepted_terms: body.acceptedTerms,
    }),
  );
  res.json({
    signed: true,
    sheetId,
    received: false,
    message:
      "Assinatura registrada. O recebimento físico continua pendente de confirmação separada.",
  });
};
