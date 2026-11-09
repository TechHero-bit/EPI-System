import { z } from "zod";
import { uuid, isoDate, required } from "../services/portal.service.js";
import { isReturnReason } from "../../../contracts/returns.mjs";

// Equipment fields are exclusively sourced from the warehouse catalog.
export const sheetIssueSchema = z
  .object({
    employeeId: uuid,
    documentDate: isoDate,
    method: z.enum(["MANUAL", "ELECTRONIC"]),
    idempotencyKey: uuid,
    items: z
      .array(
        z
          .object({
            variantId: uuid,
            quantity: z.literal(1).optional(),
            deliveryDate: isoDate.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(15),
  })
  .strict();

// Devolução: motivo por item (legenda M.D. do modelo) e destino físico.
export const sheetReturnSchema = z
  .object({
    returnedOn: isoDate,
    note: required.max(500),
    termination: z.boolean().default(false),
    idempotencyKey: uuid,
    items: z
      .array(
        z
          .object({
            index: z.number().int().min(0).max(29),
            reasonCode: z.number().int().refine(isReturnReason, {
              message: "Motivo de devolução inválido.",
            }),
            destination: z.enum(["RESTOCK", "DISCARD"]),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
