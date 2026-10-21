import { RequestHandler } from "express";
import { z } from "zod";

import {
  admin,
  uuid,
  context,
  dbResult,
  dbOk,
} from "../services/portal.service.js";
import { token } from "../services/security.service.js";

export const getaudit: RequestHandler<{ id: string; token: string }> = async (
  req,
  res,
) => {
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
};

export const getadminMembers: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
  const c = await context(req, ["ADMIN"]);
  res.json(
    dbResult(
      await c.admin
        .from("memberships")
        .select("user_id,role,created_at")
        .eq("organization_id", c.orgId),
    ),
  );
};

export const patchadminMembersId: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
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
};

export const getauthProfile: RequestHandler<{
  id: string;
  token: string;
}> = async (req, res) => {
  const c = await context(req);
  res.json({ userId: c.userId, organizationId: c.orgId, role: c.role });
};

export const getreports: RequestHandler<{ id: string; token: string }> = async (
  req,
  res,
) => {
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
};
