import { RequestHandler } from "express";
import { z } from "zod";
import { config } from "../config/environment.js";
import {
  admin,
  uuid,
  isoDate,
  required,
  error,
  context,
  owned,
  getSheet,
  dbResult,
  dbOk,
  audit,
} from "../services/portal.service.js";
import {
  secretHash,
  sha256,
  token,
  unitItems,
} from "../services/security.service.js";
import {
  renderPdf,
  renderXlsx,
  type SheetSnapshot,
} from "../services/document.service.js";

export const postsheets: RequestHandler<{ id: string; token: string }> = async (
  req,
  res,
) => {
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
            quantity: z.literal(1).optional(),
            risk: z.string().trim().max(30).optional(),
            deliveryDate: isoDate.optional(),
            description: required.max(180).optional(),
            ca: z.string().trim().max(50).optional(),
            brand: z.string().trim().max(100).optional(),
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
  for (const [index, item] of requested.entries()) {
    const fields = body.items[index]!;
    const balance = dbResult(
      await c.admin
        .from("inventory_stock")
        .select("id,stock_quantity,reserved_quantity,blocked_quantity")
        .eq("id", item.variant_id)
        .eq("organization_id", c.orgId)
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
      balance.stock_quantity -
        balance.reserved_quantity -
        balance.blocked_quantity <
        1 ||
      (product.ca_expires_at && product.ca_expires_at < now.slice(0, 10)) ||
      !product.active
    )
      throw error(
        "Escolha um equipamento ativo com estoque disponível e C.A. válido.",
      );
    items.push({
      date: fields.deliveryDate ?? body.documentDate,
      description: fields.description ?? product.description,
      ca: fields.ca ?? product.ca ?? "",
      brand: fields.brand ?? product.brand,
      risk: fields.risk ?? product.risk_code ?? "",
      size: variant.size,
      variantId: variant.id,
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
  const recordNumber = employee.registration;
  const snapshot: SheetSnapshot = {
    recordNumber,
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
    template: "COMPANY_EPI_2026_V3",
    requestKey: body.idempotencyKey,
    organizationName: organization.name,
  };
  const bytes = await renderPdf(snapshot);
  const pdfPath = `${c.orgId}/${crypto.randomUUID()}.pdf`;
  dbResult(
    await c.admin.storage.from("epi-sheets").upload(pdfPath, bytes, {
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
      return res.status(201).json({
        id: committed.id,
        pdfSha256: committed.pdf_sha256,
        method: body.method,
      });
    await c.admin.storage.from("epi-sheets").remove([pdfPath]);
    throw e;
  }
};

export const getsheetsIdPdf: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
    .send(Buffer.from(bytes));
};

export const getsheetsIdXlsx: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
  const c = await context(req);
  const sheet = await getSheet(c, req.params.id);
  const bytes = await renderXlsx(sheet.snapshot);
  res
    .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .set("Content-Disposition", `attachment; filename="ficha-${sheet.id}.xlsx"`)
    .send(Buffer.from(bytes));
};

export const postsheetsIdSigningLinks: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
    await c.admin.from("signing_links").insert({
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
  res.status(201).json({
    url: `${config().APP_ORIGIN}/assinar/${raw}`,
    expiresAt,
    delivery: "Envie o link por canal diferente do e-mail do código.",
  });
};

export const postsheetsIdReceipt: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};

export const postsheetsIdManualSignature: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};

export const getsheetsId: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
  const c = await context(req, ["ADMIN", "RH", "SEGURANCA"]);
  res.json(await getSheet(c, req.params.id));
};

export const getsheetsIdSignatureStatus: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};

export const postsheetsIdCancel: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};

export const postsheetsIdAttachment: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
      await c.admin.from("document_attachments").insert({
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
};

export const getsheetsIdAttachments: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};
