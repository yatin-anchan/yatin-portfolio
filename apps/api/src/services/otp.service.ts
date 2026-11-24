
import {
  createHmac,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

import {
  and,
  desc,
  eq,
  gt,
  isNull,
  lt,
  sql,
} from 'drizzle-orm';

import {
  db,
  adminEmailVerifications,
} from '@yatin-portfolio/database';

import { env } from '../config/env.js';
import { sendEmail } from './email.service.js';

const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;

export type OtpRecipientType = 'login_email' | 'backup_email';

export type OtpPurpose =
  | 'add_login_email'
  | 'change_primary_email'
  | 'backup_email'
  | 'sensitive_action';

export interface CreateOtpInput {
  adminUserId: string;
  adminEmailId: string | null;
  recipientType: OtpRecipientType;
  purpose: OtpPurpose;
  recipientEmail: string;
}

function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
}

function hashOtp(
  code: string,
  adminUserId: string,
  purpose: OtpPurpose,
): string {
  return createHmac('sha256', env.OTP_HMAC_SECRET)
    .update(`${adminUserId}:${purpose}:${code}`)
    .digest('hex');
}

function safeCompare(
  first: string,
  second: string,
): boolean {
  const firstBuffer = Buffer.from(first, 'hex');
  const secondBuffer = Buffer.from(second, 'hex');

  if (firstBuffer.length !== secondBuffer.length) {
    return false;
  }

  return timingSafeEqual(firstBuffer, secondBuffer);
}

export async function createAndSendOtp(
  input: CreateOtpInput,
): Promise<void> {
  const code = generateOtp();
  const now = new Date();

  const expiresAt = new Date(
    now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000,
  );

  const codeHash = hashOtp(
    code,
    input.adminUserId,
    input.purpose,
  );

  await db.transaction(async (tx) => {
    const conditions = [
      eq(
        adminEmailVerifications.adminUserId,
        input.adminUserId,
      ),
      eq(
        adminEmailVerifications.recipientType,
        input.recipientType,
      ),
      eq(
        adminEmailVerifications.purpose,
        input.purpose,
      ),
      isNull(adminEmailVerifications.consumedAt),
      isNull(adminEmailVerifications.invalidatedAt),
    ];

    if (input.adminEmailId) {
      conditions.push(
        eq(
          adminEmailVerifications.adminEmailId,
          input.adminEmailId,
        ),
      );
    } else {
      conditions.push(
        isNull(adminEmailVerifications.adminEmailId),
      );
    }

    await tx
      .update(adminEmailVerifications)
      .set({ invalidatedAt: now })
      .where(and(...conditions));

    await tx
      .insert(adminEmailVerifications)
      .values({
        adminUserId: input.adminUserId,
        adminEmailId: input.adminEmailId,
        recipientType: input.recipientType,
        purpose: input.purpose,
        codeHash,
        expiresAt,
      });
  });

  try {
    await sendEmail({
      to: input.recipientEmail,
      subject: 'Your admin verification code',
      text: [
        `Your verification code is: ${code}`,
        '',
        `This code expires in ${OTP_EXPIRY_MINUTES} minutes.`,
        'Do not share this code with anyone.',
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif">
          <h2>Email verification</h2>
          <p>Your verification code is:</p>
          <h1 style="letter-spacing:8px">${code}</h1>
          <p>This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
          <p>Do not share this code with anyone.</p>
        </div>
      `,
    });
  } catch (error) {
    const conditions = [
      eq(
        adminEmailVerifications.adminUserId,
        input.adminUserId,
      ),
      eq(
        adminEmailVerifications.codeHash,
        codeHash,
      ),
      isNull(adminEmailVerifications.consumedAt),
      isNull(adminEmailVerifications.invalidatedAt),
    ];

    await db
      .update(adminEmailVerifications)
      .set({ invalidatedAt: new Date() })
      .where(and(...conditions));

    throw error;
  }
}

export async function verifyOtp(
  adminUserId: string,
  purpose: OtpPurpose,
  code: string,
  recipientType: OtpRecipientType,
  adminEmailId: string | null,
): Promise<boolean> {
  const now = new Date();

  const conditions = [
    eq(adminEmailVerifications.adminUserId, adminUserId),
    eq(adminEmailVerifications.purpose, purpose),
    eq(adminEmailVerifications.recipientType, recipientType),
    gt(adminEmailVerifications.expiresAt, now),
    lt(adminEmailVerifications.attempts, OTP_MAX_ATTEMPTS),
    isNull(adminEmailVerifications.consumedAt),
    isNull(adminEmailVerifications.invalidatedAt),
  ];

  if (adminEmailId) {
    conditions.push(
      eq(adminEmailVerifications.adminEmailId, adminEmailId),
    );
  } else {
    conditions.push(
      isNull(adminEmailVerifications.adminEmailId),
    );
  }

  const [verification] = await db
    .select()
    .from(adminEmailVerifications)
    .where(and(...conditions))
    .orderBy(desc(adminEmailVerifications.createdAt))
    .limit(1);

  if (!verification) {
    return false;
  }

  const submittedHash = hashOtp(
    code,
    adminUserId,
    purpose,
  );

  if (!safeCompare(submittedHash, verification.codeHash)) {
    await db
      .update(adminEmailVerifications)
      .set({
        attempts: sql`${adminEmailVerifications.attempts} + 1`,
        ...(verification.attempts + 1 >= OTP_MAX_ATTEMPTS
          ? { invalidatedAt: now }
          : {}),
      })
      .where(
        and(
          eq(adminEmailVerifications.id, verification.id),
          isNull(adminEmailVerifications.consumedAt),
          isNull(adminEmailVerifications.invalidatedAt),
        ),
      );

    return false;
  }

  const [consumed] = await db
    .update(adminEmailVerifications)
    .set({ consumedAt: now })
    .where(
      and(
        eq(adminEmailVerifications.id, verification.id),
        isNull(adminEmailVerifications.consumedAt),
        isNull(adminEmailVerifications.invalidatedAt),
      ),
    )
    .returning({ id: adminEmailVerifications.id });

  return Boolean(consumed);
}
