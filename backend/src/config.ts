import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  APP_ORIGIN: z.string().url().default('http://localhost:4200'),
  TOKEN_PEPPER: z.string().min(32),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  CRON_SECRET: z.string().min(32).optional(),
  IP_RETENTION_DAYS: z.coerce.number().int().min(30).max(365).default(90),
  NODE_ENV: z.enum(['development','test','production']).default('development')
});
export type Config = z.infer<typeof schema>;
export const config = () => schema.parse(process.env);
