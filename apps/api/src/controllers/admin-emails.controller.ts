
import type { Request, Response } from 'express';

import {
  findAdminEmails,
  addAdminEmail,
  verifyAdminEmail,
  verifyPrimaryAdminEmail,
  removeAdminEmail,
} from '../services/admin-emails.service.js';

import { createAndSendOtp } from '../services/otp.service.js';

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

function getValidatedParams<T>(res: Response): T {
  return res.locals.validated?.params as T;
}

export async function listAdminEmails(
  _req: Request,
  res: Response,
): Promise<void> {
  const emails = await findAdminEmails(getAdmin(res).id);

  res.status(200).json({
    data: emails,
    meta: { total: emails.length },
  });
}

export async function addEmail(
  _req: Request,
  res: Response,
): Promise<void> {
  const input = getValidatedBody<{
    email: string;
    password: string;
  }>(res);

  await addAdminEmail(
    getAdmin(res).id,
    input.email,
    input.password,
  );

  res.status(201).json({
    message: 'Login email added. A verification code has been sent to the email address.',
  });
}

export async function verifyEmail(
  _req: Request,
  res: Response,
): Promise<void> {
  const { id } = getValidatedParams<{ id: string }>(res);
  const { code } = getValidatedBody<{ code: string }>(res);

  const verified = await verifyAdminEmail(
    getAdmin(res).id,
    id,
    code,
  );

  if (!verified) {
    res.status(400).json({
      error: {
        code: 'EMAIL_VERIFICATION_FAILED',
        message: 'The email verification code is invalid, expired, or the email cannot be verified.',
      },
    });
    return;
  }

  res.status(200).json({
    message: 'Login email verified successfully.',
  });
}

export async function requestPrimaryEmailChange(
  _req: Request,
  res: Response,
): Promise<void> {
  const { id } = getValidatedParams<{ id: string }>(res);
  const adminUserId = getAdmin(res).id;

  const emails = await findAdminEmails(adminUserId);
  const target = emails.find((email) => email.id === id);

  if (!target) {
    res.status(404).json({
      error: {
        code: 'EMAIL_NOT_FOUND',
        message: 'Login email was not found.',
      },
    });
    return;
  }

  if (!target.isVerified) {
    res.status(409).json({
      error: {
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify this email before making it primary.',
      },
    });
    return;
  }

  if (target.isPrimary) {
    res.status(200).json({
      message: 'This email is already the primary login email.',
    });
    return;
  }

  await createAndSendOtp({
    adminUserId,
    adminEmailId: id,
    recipientType: 'login_email',
    purpose: 'change_primary_email',
    recipientEmail: target.email,
  });

  res.status(202).json({
    message: 'A verification code has been sent to the target email address.',
  });
}

export async function verifyPrimaryEmailChange(
  _req: Request,
  res: Response,
): Promise<void> {
  const { id } = getValidatedParams<{ id: string }>(res);
  const { code } = getValidatedBody<{ code: string }>(res);

  const changed = await verifyPrimaryAdminEmail(
    getAdmin(res).id,
    id,
    code,
  );

  if (!changed) {
    res.status(400).json({
      error: {
        code: 'PRIMARY_EMAIL_VERIFICATION_FAILED',
        message: 'The verification code is invalid, expired, or the email cannot be made primary.',
      },
    });
    return;
  }

  res.status(200).json({
    message: 'Primary login email changed successfully.',
  });
}

export async function deleteEmail(
  _req: Request,
  res: Response,
): Promise<void> {
  const admin = getAdmin(res);
  const { id } = getValidatedParams<{ id: string }>(res);
  const { currentPassword } = getValidatedBody<{
    currentPassword: string;
  }>(res);

  const passwordHash = await reauthenticateAdmin(
    admin.id,
    admin.emailId,
    currentPassword,
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

  const removed = await removeAdminEmail(
    admin.id,
    id,
    admin.emailId,
    passwordHash,
  );

  if (!removed) {
    res.status(409).json({
      error: {
        code: 'EMAIL_REMOVAL_FAILED',
        message: 'Email not found, already removed, it is the primary email, or it is the current login email.',
      },
    });
    return;
  }

  res.status(200).json({
    message: 'Login email removed successfully.',
  });
}
