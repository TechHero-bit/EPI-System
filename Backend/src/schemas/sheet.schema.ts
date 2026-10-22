import { z } from "zod";
import { uuid, isoDate } from "../services/portal.service.js";

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
