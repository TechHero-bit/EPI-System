import { RequestHandler } from "express";
import { z } from "zod";
import {
  uuid,
  required,
  error,
  context,
  owned,
  dbResult,
  dbOk,
  audit,
} from "../services/portal.service.js";

// Listas gerenciadas pela Administração. Nada é fixo no código: clientes,
// unidades e RACs vêm destas tabelas.
const LISTS = {
  clients: "clients",
  "work-units": "work_units",
  racs: "racs",
} as const;
const table = (kind: string) => {
  const name = LISTS[kind as keyof typeof LISTS];
  if (!name) throw error("Lista não encontrada.", 404);
  return name;
};

export const postList: RequestHandler<{ kind: string }> = async (req, res) => {
  // RH may add clients (from the kit screen); units, RACs and any edit stay with ADMIN.
  const c = await context(
    req,
    req.params.kind === "clients" ? ["ADMIN", "RH"] : ["ADMIN"],
  );
  const name = table(req.params.kind);
  const body = z.object({ name: required.max(160) }).parse(req.body);
  const data = dbResult(
    await c.admin
      .from(name)
      .insert({ organization_id: c.orgId, name: body.name })
      .select()
      .single(),
  );
  await audit(c, "LIST_ITEM_CREATED", name, data.id);
  res.status(201).json(data);
};

export const patchList: RequestHandler<{ kind: string; id: string }> = async (
  req,
  res,
) => {
  const c = await context(req, ["ADMIN"]);
  const name = table(req.params.kind);
  const body = z
    .object({ name: required.max(160).optional(), active: z.boolean().optional() })
    .strict()
    .parse(req.body);
  await owned(c, name, req.params.id);
  const data = dbResult(
    await c.admin
      .from(name)
      .update(body)
      .eq("id", req.params.id)
      .eq("organization_id", c.orgId)
      .select()
      .single(),
  );
  await audit(c, "LIST_ITEM_UPDATED", name, data.id, {
    name: body.name !== undefined,
    active: body.active,
  });
  res.json(data);
};

export const putKit: RequestHandler = async (req, res) => {
  const c = await context(req, ["ADMIN", "RH"]);
  const body = z
    .object({
      clientId: uuid,
      // Vazio = kit geral do cliente, usado quando não há kit da função.
      jobTitle: z.string().trim().max(120).default(""),
      items: z
        .array(z.object({ productId: uuid, quantity: z.number().int().min(1).max(15) }))
        .min(1)
        .max(15),
    })
    .parse(req.body);
  const id = dbResult(
    await c.admin.rpc("save_epi_kit", {
      p_org: c.orgId,
      p_actor: c.userId,
      p_client: body.clientId,
      p_job_title: body.jobTitle,
      p_items: body.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
    }),
  );
  res.json({ id });
};

export const deleteKit: RequestHandler<{ id: string }> = async (req, res) => {
  const c = await context(req, ["ADMIN", "RH"]);
  const kit = await owned<any>(c, "epi_kits", req.params.id);
  dbOk(await c.admin.from("epi_kit_items").delete().eq("kit_id", kit.id));
  dbOk(await c.admin.from("epi_kits").delete().eq("id", kit.id).eq("organization_id", c.orgId));
  await audit(c, "EPI_KIT_DELETED", "epi_kit", kit.id);
  res.status(204).end();
};
