
import { z } from 'zod';

const envSchema = z
  .object({
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

    BACKUP_EMAIL_ENCRYPTION_KEY: z.string().min(1),

    OTP_HMAC_SECRET: z.string().min(1),

    FRONTEND_URL: z.string().url().default('http://localhost:5173'),

    PASSWORD_RESET_URL: z
  .string()
  .url()
  .default('http://localhost:5173/admin/reset-password'),

  CLOUDINARY_CLOUD_NAME: z.string().trim().min(1).optional(),
CLOUDINARY_API_KEY: z.string().trim().min(1).optional(),
CLOUDINARY_API_SECRET: z.string().trim().min(1).optional(),

    SMTP_HOST: z.string().trim().min(1).optional(),

    SMTP_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(587),

    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

    SMTP_USER: z.string().optional(),

    SMTP_PASS: z.string().optional(),

    SMTP_FROM: z.string().trim().email().optional(),
  })
  .superRefine((data, ctx) => {
    if (Boolean(data.SMTP_USER) !== Boolean(data.SMTP_PASS)) {
      ctx.addIssue({
        code: 'custom',
        message: 'SMTP_USER and SMTP_PASS must be provided together.',
        path: ['SMTP_USER'],
      });
    }

    const cloudinaryValues = [
  data.CLOUDINARY_CLOUD_NAME,
  data.CLOUDINARY_API_KEY,
  data.CLOUDINARY_API_SECRET,
];

const configuredCloudinaryValues = cloudinaryValues.filter(Boolean).length;

if (
  configuredCloudinaryValues !== 0 &&
  configuredCloudinaryValues !== 3
) {
  ctx.addIssue({
    code: 'custom',
    message: 'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be provided together.',
    path: ['CLOUDINARY_CLOUD_NAME'],
  });
}
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
