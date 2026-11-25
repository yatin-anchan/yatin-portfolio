
import type { Request, Response } from 'express';

import {
  getBackupEmailStatus,
  addBackupEmail,
  verifyBackupEmail,
  removeBackupEmail,
} from '../services/backup-email.service.js';

import { reauthenticateAdmin } from '../services/admin-reauth.service.js';

interface AuthenticatedAdmin {
  id: string;
  emailId: string;
}

function getAdmin(res: Response): AuthenticatedAdmin {
  return res.locals.admin as AuthenticatedAdmin;
}

function getValidatedBody<T>(res: Response): T {
  return res.locals.validated?.body as T;
}

export async function getBackupEmail(
  _req: Request,
  res: Response,
): Promise<void> {
  const status = await getBackupEmailStatus(getAdmin(res).id);

  res.status(200).json({ data: status });
}

export async function addBackupEmailAddress(
  _req: Request,
  res: Response,
): Promise<void> {
  const input = getValidatedBody<{ email: string }>(res);

  await addBackupEmail(getAdmin(res).id, input.email);

  res.status(201).json({
    message: 'Backup email added. A verification code has been sent to the address.',
  });
}

export async function verifyBackupEmailAddress(
  _req: Request,
  res: Response,
): Promise<void> {
  const input = getValidatedBody<{ code: string }>(res);

  const verified = await verifyBackupEmail(
    getAdmin(res).id,
    input.code,
  );

  if (!verified) {
    res.status(400).json({
      error: {
        code: 'BACKUP_EMAIL_VERIFICATION_FAILED',
        message: 'The verification code is invalid, expired, or the backup email cannot be verified.',
      },
    });
    return;
  }

  res.status(200).json({
    message: 'Backup email verified successfully.',
  });
}

export async function deleteBackupEmail(
  _req: Request,
  res: Response,
): Promise<void> {
  const admin = getAdmin(res);
  const input = getValidatedBody<{ currentPassword: string }>(res);

  const passwordHash = await reauthenticateAdmin(
    admin.id,
    admin.emailId,
    input.currentPassword,
  );

  if (!passwordHash) {
    res.status(401).json({
      error: {
        code: 'REAUTHENTICATION_FAILED',
        message: 'The current password is incorrect or the authenticated login email is unavailable.',
      },
    });
    return;
  }

  const removed = await removeBackupEmail(
    admin.id,
    admin.emailId,
    passwordHash,
  );

  if (!removed) {
    res.status(404).json({
      error: {
        code: 'BACKUP_EMAIL_NOT_FOUND',
        message: 'No backup email is configured, or the authenticated login email is unavailable.',
      },
    });
    return;
  }

  res.status(200).json({
    message: 'Backup email removed successfully.',
  });
}
