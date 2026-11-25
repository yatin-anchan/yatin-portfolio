
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
  adminUsers,
  adminEmails,
  adminEmailVerifications,
  adminSecuritySettings,
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

type OtpTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

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

function safeCompare(first: string, second: string): boolean {
  const firstBuffer = Buffer.from(first, 'hex');
  const secondBuffer = Buffer.from(second, 'hex');

  if (
    firstBuffer.length !== secondBuffer.length ||
    firstBuffer.length === 0
  ) {
    return false;
  }

  return timingSafeEqual(firstBuffer, secondBuffer);
}

function buildOtpConditions(
  adminUserId: string,
  purpose: OtpPurpose,
  recipientType: OtpRecipientType,
  adminEmailId: string | null,
  now: Date,
) {
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

  return conditions;
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
      eq(adminEmailVerifications.adminUserId, input.adminUserId),
      eq(adminEmailVerifications.recipientType, input.recipientType),
      eq(adminEmailVerifications.purpose, input.purpose),
      isNull(adminEmailVerifications.consumedAt),
      isNull(adminEmailVerifications.invalidatedAt),
    ];

    if (input.adminEmailId) {
      conditions.push(
        eq(adminEmailVerifications.adminEmailId, input.adminEmailId),
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
    await db
      .update(adminEmailVerifications)
      .set({ invalidatedAt: new Date() })
      .where(
        and(
          eq(adminEmailVerifications.adminUserId, input.adminUserId),
          eq(adminEmailVerifications.codeHash, codeHash),
          isNull(adminEmailVerifications.consumedAt),
          isNull(adminEmailVerifications.invalidatedAt),
        ),
      );

    throw error;
  }
}

/**
 * Verify and consume an OTP using an existing transaction.
 * The row lock prevents concurrent use of the same code.
 */
export async function verifyOtpInTransaction(
  tx: OtpTransaction,
  adminUserId: string,
  purpose: OtpPurpose,
  code: string,
  recipientType: OtpRecipientType,
  adminEmailId: string | null,
): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  const now = new Date();

  const [verification] = await tx
    .select()
    .from(adminEmailVerifications)
    .where(
      and(
        ...buildOtpConditions(
          adminUserId,
          purpose,
          recipientType,
          adminEmailId,
          now,
        ),
      ),
    )
    .orderBy(desc(adminEmailVerifications.createdAt))
    .limit(1)
    .for('update');

  if (!verification) {
    return false;
  }

  const submittedHash = hashOtp(code, adminUserId, purpose);

  if (!safeCompare(submittedHash, verification.codeHash)) {
    const nextAttempts = verification.attempts + 1;

    await tx
      .update(adminEmailVerifications)
      .set({
        attempts: sql`${adminEmailVerifications.attempts} + 1`,
        ...(nextAttempts >= OTP_MAX_ATTEMPTS
          ? { invalidatedAt: now }
          : {}),
      })
      .where(
        and(
          eq(adminEmailVerifications.id, verification.id),
          lt(adminEmailVerifications.attempts, OTP_MAX_ATTEMPTS),
          isNull(adminEmailVerifications.consumedAt),
          isNull(adminEmailVerifications.invalidatedAt),
        ),
      );

    return false;
  }

  const [consumed] = await tx
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

export async function verifySensitiveActionIfRequired(
  tx: OtpTransaction,
  adminUserId: string,
  code: string | undefined,
): Promise<boolean> {
  const [adminUser] = await tx
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.id, adminUserId))
    .for('update')
    .limit(1);

  if (!adminUser) {
    return false;
  }

  const [settings] = await tx
    .select({
      requireDualVerification:
        adminSecuritySettings.requireDualVerification,
    })
    .from(adminSecuritySettings)
    .where(eq(adminSecuritySettings.adminUserId, adminUserId))
    .for('update')
    .limit(1);

  if (!settings) {
    return false;
  }

  if (!settings.requireDualVerification) {
    return true;
  }

  if (!code) {
    return false;
  }

  const [trustedEmail] = await tx
    .select({ id: adminEmails.id })
    .from(adminEmails)
    .where(
      and(
        eq(adminEmails.adminUserId, adminUserId),
        eq(adminEmails.isPrimary, true),
        eq(adminEmails.isVerified, true),
        isNull(adminEmails.removedAt),
      ),
    )
    .limit(1)
    .for('update');

  if (!trustedEmail) {
    return false;
  }

  return verifyOtpInTransaction(
    tx,
    adminUserId,
    'sensitive_action',
    code,
    'login_email',
    trustedEmail.id,
  );
}

class OtpOperationRejected extends Error {
  constructor() {
    super('The operation authorized by the OTP was rejected.');
    this.name = 'OtpOperationRejected';
  }
}

/**
 * Consume an OTP and perform its authorized database update
 * in the same transaction.
 *
 * If operation returns false, the transaction rolls back,
 * including the OTP consumption.
 */
export async function verifyOtpAndRun(
  adminUserId: string,
  purpose: OtpPurpose,
  code: string,
  recipientType: OtpRecipientType,
  adminEmailId: string | null,
  operation: (tx: OtpTransaction) => Promise<boolean>,
): Promise<boolean> {
  try {
    return await db.transaction(async (tx) => {
      const [adminUser] = await tx
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.id, adminUserId))
        .for('update')
        .limit(1);

      if (!adminUser) {
        return false;
      }

      const valid = await verifyOtpInTransaction(
        tx,
        adminUserId,
        purpose,
        code,
        recipientType,
        adminEmailId,
      );

      if (!valid) {
        return false;
      }

      const completed = await operation(tx);

      if (!completed) {
        throw new OtpOperationRejected();
      }

      return true;
    });
  } catch (error) {
    if (error instanceof OtpOperationRejected) {
      return false;
    }

    throw error;
  }
}

/**
 * Standalone OTP verification for operations that do not
 * need an additional database update.
 */
export async function verifyOtp(
  adminUserId: string,
  purpose: OtpPurpose,
  code: string,
  recipientType: OtpRecipientType,
  adminEmailId: string | null,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [adminUser] = await tx
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.id, adminUserId))
      .for('update')
      .limit(1);

    if (!adminUser) {
      return false;
    }

    return verifyOtpInTransaction(
      tx,
      adminUserId,
      purpose,
      code,
      recipientType,
      adminEmailId,
    );
  });
}
