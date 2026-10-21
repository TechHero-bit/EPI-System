import { z } from "zod";
import { required, isoDate } from "../services/portal.service.js";
export const productSchema = z.object({
  category: required.max(80),
  description: required.max(180),
  ca: z.string().trim().max(50).nullable().optional(),
  brand: z.string().trim().max(100).default(""),
  model: z.string().trim().max(100).default(""),
  riskCode: z.string().trim().max(30).default(""),
  caExpiresAt: isoDate.nullable().optional(),
  active: z.boolean().optional(),
  photoUrl: z
    .url()
    .regex(/^https:\/\//)
    .nullable()
    .optional()
    .or(z.literal("")),
  unit: z.literal("UN").default("UN"),
  usefulLifeDays: z.number().int().positive().max(36500).nullable().optional(),
});
