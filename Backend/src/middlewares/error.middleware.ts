import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req,
  res,
  _next,
) => {
  if (err instanceof ZodError)
    return res
      .status(400)
      .json({ error: "Dados inválidos.", issues: err.issues });
  const e = err as { status?: number; message?: string };
  if (!e.status || e.status >= 500) console.error(e);
  res
    .status(e.status || 500)
    .json({ error: e.status ? e.message : "Falha interna. Tente novamente." });
};
