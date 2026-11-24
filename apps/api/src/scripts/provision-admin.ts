
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  db,
  pool,
  adminUsers,
  adminEmails,
  adminSecuritySettings,
  adminAuditLogs,
} from '@yatin-portfolio/database';

import { hashPassword } from '../services/password.service.js';

import {
  createAndSendOtp,
  verifyOtp,
} from '../services/otp.service.js';

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(12).max(128);

async function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Provisioning requires an interactive terminal.');
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = '';

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdout.write('\n');
    };

    const onData = (chunk: Buffer | string) => {
      const input = chunk.toString('utf8');

      for (const character of input) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Provisioning cancelled.'));
          return;
        }

        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(value);
          return;
        }

        if (character === '\u007f' || character === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
          }
          continue;
        }

        if (character >= ' ' && character <= '~') {
          value += character;
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function provision(): Promise<void> {
  const terminal = createInterface({
    input: stdin,
    output: stdout,
  });

  let adminUserId: string | null = null;

  try {
    stdout.write('\n=== Initial Admin Provisioning ===\n\n');

    const emailInput = await terminal.question('Admin email: ');
    const email = emailSchema.parse(emailInput).toLowerCase();

    terminal.close();

    const password = await readHidden('Admin password: ');
    const confirmation = await readHidden('Confirm password: ');

    passwordSchema.parse(password);

    if (password !== confirmation) {
      throw new Error('Passwords do not match.');
    }

    const passwordHash = await hashPassword(password);

    stdout.write('\nCreating initial administrator...\n');

    const created = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('portfolio_initial_admin'))`,
      );

      const [existingAdmin] = await tx
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .limit(1);

      if (existingAdmin) {
        throw new Error(
          'An administrator already exists. Initial provisioning is disabled.',
        );
      }

      const [admin] = await tx
        .insert(adminUsers)
        .values({})
        .returning({ id: adminUsers.id });

      if (!admin) {
        throw new Error('Failed to create administrator.');
      }

      const [adminEmail] = await tx
        .insert(adminEmails)
        .values({
          adminUserId: admin.id,
          email,
          passwordHash,
          isPrimary: false,
          isVerified: false,
        })
        .returning({ id: adminEmails.id });

      if (!adminEmail) {
        throw new Error('Failed to create administrator email.');
      }

      await tx.insert(adminSecuritySettings).values({
        adminUserId: admin.id,
        requireDualVerification: true,
        loginNotificationEnabled: true,
        securityNotificationEnabled: true,
      });

      return {
        adminUserId: admin.id,
        adminEmailId: adminEmail.id,
      };
    });

    adminUserId = created.adminUserId;

    stdout.write('Administrator record created.\n');
    stdout.write('Sending verification email...\n');

    await createAndSendOtp({
      adminUserId: created.adminUserId,
      adminEmailId: created.adminEmailId,
      recipientType: 'login_email',
      purpose: 'add_login_email',
      recipientEmail: email,
    });

    stdout.write(`Verification code sent to ${email}.\n`);

    let verified = false;

    for (let attempt = 1; attempt <= 5; attempt++) {
      const code = await readHidden(
        `Enter verification code (attempt ${attempt}/5): `,
      );

      if (!/^\d{6}$/.test(code)) {
        stdout.write('Invalid code format.\n');
        continue;
      }

      verified = await verifyOtp(
        created.adminUserId,
        'add_login_email',
        code,
        'login_email',
        created.adminEmailId,
      );

      if (verified) {
        break;
      }

      stdout.write('Incorrect or expired verification code.\n');
    }

    if (!verified) {
      throw new Error('Email verification failed.');
    }

    await db.transaction(async (tx) => {
      await tx
        .update(adminEmails)
        .set({
          isVerified: true,
          verifiedAt: new Date(),
          isPrimary: true,
        })
        .where(eq(adminEmails.id, created.adminEmailId));

      await tx.insert(adminAuditLogs).values({
        adminId: created.adminUserId,
        action: 'admin.initial_provisioned',
        entityType: 'admin_user',
        entityId: created.adminUserId,
        description:
          'Initial administrator account provisioned and verified.',
      });
    });

    stdout.write('\nInitial administrator successfully provisioned.\n');
    stdout.write(`Admin ID: ${created.adminUserId}\n`);
    stdout.write(`Primary email: ${email}\n`);
    stdout.write('Email verification: complete\n');
    stdout.write('Account status: active\n');
  } catch (error) {
    if (adminUserId) {
      try {
        await db
          .delete(adminUsers)
          .where(eq(adminUsers.id, adminUserId));

        stdout.write(
          'Incomplete initial account was rolled back.\n',
        );
      } catch (cleanupError) {
        stdout.write(
          'Warning: automatic cleanup failed. Inspect admin records before retrying.\n',
        );
        console.error('Cleanup error:', cleanupError);
      }
    }

    throw error;
  } finally {
    terminal.close();
    await pool.end();
  }
}

provision().catch((error: unknown) => {
  stdout.write('\nProvisioning failed.\n');

  if (error instanceof Error) {
    console.error('Message:', error.message);
    console.error('Cause:', error.cause);
    console.error('Stack:', error.stack);

    const databaseError = error as Error & {
      code?: string;
      detail?: string;
      constraint?: string;
      table?: string;
      column?: string;
      schema?: string;
      routine?: string;
    };

    if (databaseError.code) {
      console.error('PostgreSQL error code:', databaseError.code);
    }

    if (databaseError.detail) {
      console.error('Database detail:', databaseError.detail);
    }

    if (databaseError.constraint) {
      console.error('Constraint:', databaseError.constraint);
    }

    if (databaseError.table) {
      console.error('Table:', databaseError.table);
    }

    if (databaseError.column) {
      console.error('Column:', databaseError.column);
    }
  } else {
    console.error('Unknown error:', error);
  }

  process.exitCode = 1;
});
