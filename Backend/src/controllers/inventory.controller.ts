import { RequestHandler } from "express";
import { z } from "zod";

import {
  uuid,
  error,
  required,
  context,
  owned,
  dbResult,
  dbOk,
  audit,
} from "../services/portal.service.js";
import { normalizeCaNumber } from "../services/ca-registry.service.js";

import { productSchema } from "../schemas/product.schema.js";
import { equipmentSizeSchema } from "../schemas/equipment-size.schema.js";

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
      size: equipmentSizeSchema,
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

const movementSchema = z.object({
  quantity: z.number().int().min(-100000).max(100000).refine((v) => v !== 0),
  reason: required.min(5).max(300),
  idempotencyKey: uuid,
});

// Every manual movement outside a sheet requires a justification (entry, withdrawal, adjustment).
const moveInventory =
  (operation: "RECEIPT" | "WITHDRAWAL" | "ADJUSTMENT"): RequestHandler<{
    id: string;
  }> =>
  async (req, res) => {
    const c = await context(req, ["ADMIN", "ALMOXARIFADO"]);
    const body = movementSchema.parse(req.body);
    if (operation !== "ADJUSTMENT" && body.quantity < 1)
      throw error("Informe uma quantidade positiva.");
    const stock = dbResult(
      await c.admin.rpc("move_inventory", {
        p_org: c.orgId,
        p_actor: c.userId,
        p_variant: uuid.parse(req.params.id),
        p_operation: operation,
        p_quantity: body.quantity,
        p_reason: body.reason,
        p_key: body.idempotencyKey,
      }),
    );
    res.json({ stockQuantity: stock });
  };
export const postInventoryReceive = moveInventory("RECEIPT");
export const postInventoryWithdraw = moveInventory("WITHDRAWAL");
export const postInventoryAdjust = moveInventory("ADJUSTMENT");

export const putProductSizes: RequestHandler<{ id: string }> = async (
  req,
  res,
) => {
  const c = await context(req, ["ADMIN", "ALMOXARIFADO"]);
  const body = z
    .object({ sizes: z.array(equipmentSizeSchema).min(1).max(81) })
    .parse(req.body);
  await owned(c, "products", req.params.id);
  const changes = dbResult(
    await c.admin.rpc("sync_product_sizes", {
      p_org: c.orgId,
      p_actor: c.userId,
      p_product: req.params.id,
      p_sizes: [...new Set(body.sizes)],
    }),
  );
  res.json({ changes });
};

export const getCaRegistry: RequestHandler<{ number: string }> = async (
  req,
  res,
) => {
  const c = await context(req, ["ADMIN", "ALMOXARIFADO", "RH", "SEGURANCA"]);
  const ca = normalizeCaNumber(req.params.number);
  if (!ca) throw error("Informe somente os números do C.A.");
  const result = await c.admin
    .from("ca_registry")
    .select(
      "ca_number,expires_at,status,equipment_name,equipment_description,manufacturer,brand,imported_at",
    )
    .eq("ca_number", ca)
    .maybeSingle();
  dbOk(result);
  if (!result.data)
    throw error("C.A. não encontrado na base importada. Preencha manualmente.", 404);
  res.json(result.data);
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
