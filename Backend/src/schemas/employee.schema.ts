import { z } from "zod";
import { required, isoDate, uuid } from "../services/portal.service.js";
export const employeeSchema = z.object({
  name: required.min(2).max(160),
  registration: required.max(50),
  department: z.string().trim().max(100).default(""),
  jobTitle: required.max(120),
  admissionDate: isoDate,
  terminationDate: isoDate.nullable().optional(),
  personalEmail: z.email().nullable().optional(),
  phone: z.string().max(30).default(""),
  workUnit: z.string().trim().max(120).default(""),
  facialOptIn: z.boolean().default(false),
  clientId: uuid.nullable().optional(),
  workUnitId: uuid.nullable().optional(),
  racIds: z.array(uuid).max(50).optional(),
  cpf: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{11}$/))
    .nullable()
    .optional(),
});
