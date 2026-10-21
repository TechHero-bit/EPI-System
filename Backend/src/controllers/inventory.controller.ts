import { RequestHandler } from "express";
import { z } from "zod";

import {
  admin,
  uuid,
  isoDate,
  required,
  context,
  owned,
  dbResult,
  dbOk,
  audit,
} from "../services/portal.service.js";
import { token } from "../services/security.service.js";

import { productSchema } from "../schemas/product.schema.js";

export const postproducts: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};

export const patchproductsId: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};

export const deleteproductsId: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};

export const postvariants: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};

export const postInventoryReceive: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
  const c = await context(req, ["ADMIN", "ALMOXARIFADO"]);
  const body = z
    .object({
      quantity: z.number().int().positive().max(100000),
      reason: z.string().max(300).default(""),
      idempotencyKey: uuid,
    })
    .parse(req.body);
  const data = dbResult(
    await c.admin.rpc("operate_inventory", {
      p_org: c.orgId,
      p_actor: c.userId,
      p_variant: uuid.parse(req.params.id),
      p_quantity: body.quantity,
      p_reason: body.reason,
      p_adjust: false,
      p_key: body.idempotencyKey,
    }),
  );
  res.json({ stockQuantity: data });
};

export const postInventoryAdjust: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
    await c.admin.rpc("operate_inventory", {
      p_org: c.orgId,
      p_actor: c.userId,
      p_variant: uuid.parse(req.params.id),
      p_quantity: b.quantity,
      p_reason: b.reason,
      p_adjust: true,
      p_key: b.idempotencyKey,
    }),
  );
  res.json({ stockQuantity: stock });
};

export const getcategories: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
  const c = await context(req);
  const rows = dbResult(
    await c.admin
      .from("products")
      .select("category")
      .eq("organization_id", c.orgId),
  );
  res.json([...new Set(rows.map((p: any) => p.category))]);
};
