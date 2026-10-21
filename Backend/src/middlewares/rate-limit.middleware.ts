import type { RequestHandler } from "express";
import { secretHash } from "../services/security.service.js";
import { config } from "../config/environment.js";
import { admin, dbResult } from "../services/portal.service.js";
export const publicRateLimit: RequestHandler = async (req, res, next) => {
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
};
