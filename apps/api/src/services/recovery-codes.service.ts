
import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import {
  and,
  eq,
  isNull,
} from 'drizzle-orm';

import {
  db,
  adminRecoveryCodes,
} from '@yatin-portfolio/database';

const RECOVERY_CODE_COUNT = 10;

function generateRecoveryCode(): string {
  const bytes = randomBytes(8).toString('hex').toUpperCase();

  return `${bytes.slice(0, 8)}-${bytes.slice(8)}`;
}

function hashRecoveryCode(code: string): string {
  return createHash('sha256')
    .update(code.replace(/-/g, '').toUpperCase())
    .digest('hex');
}

function safeCompare(first: string, second: string): boolean {
  const firstBuffer = Buffer.from(first, 'hex');
  const secondBuffer = Buffer.from(second, 'hex');

  if (firstBuffer.length !== secondBuffer.length) {
    return false;
  }

  return timingSafeEqual(firstBuffer, secondBuffer);
}

export async function generateRecoveryCodes(
  adminUserId: string,
): Promise<string[]> {
  const codes = Array.from(
    { length: RECOVERY_CODE_COUNT },
    generateRecoveryCode,
  );

  const records = codes.map((code) => ({
    adminUserId,
    codeHash: hashRecoveryCode(code),
  }));

  await db.transaction(async (tx) => {
    await tx
      .delete(adminRecoveryCodes)
      .where(eq(adminRecoveryCodes.adminUserId, adminUserId));

    await tx
      .insert(adminRecoveryCodes)
      .values(records);
  });

  // Plaintext codes are returned once and must never be stored or logged.
  return codes;
}

export async function verifyRecoveryCode(
  adminUserId: string,
  code: string,
): Promise<boolean> {
  const normalizedCode = code.trim().toUpperCase();

  if (!/^[A-F0-9]{8}-?[A-F0-9]{8}$/.test(normalizedCode)) {
    return false;
  }

  const submittedHash = hashRecoveryCode(normalizedCode);
  const [record] = await db
    .select({
      id: adminRecoveryCodes.id,
      codeHash: adminRecoveryCodes.codeHash,
    })
    .from(adminRecoveryCodes)
    .where(
      and(
        eq(adminRecoveryCodes.adminUserId, adminUserId),
        eq(adminRecoveryCodes.codeHash, submittedHash),
        isNull(adminRecoveryCodes.usedAt),
      ),
    )
    .limit(1);

  if (!record || !safeCompare(submittedHash, record.codeHash)) {
    return false;
  }

  // Conditional update ensures a code can only be consumed once.
  const [consumed] = await db
    .update(adminRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(adminRecoveryCodes.id, record.id),
        eq(adminRecoveryCodes.adminUserId, adminUserId),
        isNull(adminRecoveryCodes.usedAt),
      ),
    )
    .returning({
      id: adminRecoveryCodes.id,
    });

  return Boolean(consumed);
}

export async function countUnusedRecoveryCodes(
  adminUserId: string,
): Promise<number> {
  const records = await db
    .select({ id: adminRecoveryCodes.id })
    .from(adminRecoveryCodes)
    .where(
      and(
        eq(adminRecoveryCodes.adminUserId, adminUserId),
        isNull(adminRecoveryCodes.usedAt),
      ),
    );

  return records.length;
}
