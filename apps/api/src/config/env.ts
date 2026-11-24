
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(3000),

  DATABASE_URL: z.string().url(),

  BACKUP_EMAIL_ENCRYPTION_KEY: z
    .string()
    .min(1),

  OTP_HMAC_SECRET: z
    .string()
    .min(1),

    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment configuration:');

  for (const issue of result.error.issues) {
    console.error(`- ${issue.path.join('.')}: ${issue.message}`);
  }

  throw new Error('Environment validation failed');
}



export const env = Object.freeze(result.data);
