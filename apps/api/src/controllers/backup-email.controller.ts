
import type { Request, Response } from 'express';

import {
  getBackupEmailStatus,
  addBackupEmail,
  verifyBackupEmail,
  removeBackupEmail,
} from '../services/backup-email.service.js';

import { reauthenticateAdmin } from '../services/admin-reauth.service.js';
import { notifyAdminSecurityEvent } from '../services/admin-security-settings.service.js';

interface AuthenticatedAdmin {
  id: string;
  emailId: string;
  email: string;
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
  req: Request,
  res: Response,
): Promise<void> {
  const input = getValidatedBody<{
    email: string;
    currentPassword: string;
    verificationCode?: string;
  }>(res);
  const admin = getAdmin(res);
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

  await addBackupEmail(
    admin.id,
    admin.emailId,
    passwordHash,
    input.email,
    input.verificationCode,
    req.ip ?? null,
    req.get('user-agent') ?? null,
  );

  void notifyAdminSecurityEvent(
    admin.id,
    admin.email,
    'A backup email was added to your administrator account.',
  );

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

  const admin = getAdmin(res);
  void notifyAdminSecurityEvent(
    admin.id,
    admin.email,
    'A backup email was verified for your administrator account.',
  );

  res.status(200).json({
    message: 'Backup email verified successfully.',
  });
}

export async function deleteBackupEmail(
  req: Request,
  res: Response,
): Promise<void> {
  const admin = getAdmin(res);
  const input = getValidatedBody<{
    currentPassword: string;
    verificationCode?: string;
  }>(res);

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
    input.verificationCode,
    req.ip ?? null,
    req.get('user-agent') ?? null,
  );

  if (!removed) {
    res.status(409).json({
      error: {
        code: 'BACKUP_EMAIL_REMOVAL_FAILED',
        message: 'No backup email is configured, reauthentication failed, or trusted verification was invalid.',
      },
    });
    return;
  }

  void notifyAdminSecurityEvent(
    admin.id,
    admin.email,
    'The backup email for your administrator account was removed.',
  );

  res.status(200).json({
    message: 'Backup email removed successfully.',
  });
}
