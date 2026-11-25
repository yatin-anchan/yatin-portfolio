
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
import {
  getTrustedPrimaryAdminEmail,
  notifyAdminSecurityEvent,
} from '../services/admin-security-settings.service.js';

function requestMetadata(req: Request) {
  const userAgent = req.get('user-agent');

  return {
    ipAddress: req.ip ?? null,
    userAgent: userAgent ?? null,
  };
}

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
  req: Request,
  res: Response,
): Promise<void> {
  const input = getValidatedBody<{
    email: string;
    password: string;
    currentPassword: string;
    trustedCode: string;
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

  const trustedEmail = await getTrustedPrimaryAdminEmail(admin.id);
  const metadata = requestMetadata(req);

  await addAdminEmail(
    admin.id,
    admin.emailId,
    passwordHash,
    trustedEmail.id,
    input.email,
    input.password,
    input.trustedCode,
    metadata.ipAddress,
    metadata.userAgent,
  );

  void notifyAdminSecurityEvent(
    admin.id,
    admin.email,
    'A new login email was added to your administrator account.',
  );

  res.status(201).json({
    message: 'Login email added. A verification code has been sent to the email address.',
  });
}

export async function verifyEmail(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = getValidatedParams<{ id: string }>(res);
  const { code } = getValidatedBody<{ code: string }>(res);

  const metadata = requestMetadata(req);
  const verified = await verifyAdminEmail(
    getAdmin(res).id,
    id,
    code,
    metadata.ipAddress,
    metadata.userAgent,
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

  void notifyAdminSecurityEvent(
    getAdmin(res).id,
    getAdmin(res).email,
    'A login email was verified for your administrator account.',
  );

  res.status(200).json({
    message: 'Login email verified successfully.',
  });
}

export async function requestPrimaryEmailChange(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = getValidatedParams<{ id: string }>(res);
  const adminUserId = getAdmin(res).id;
  const admin = getAdmin(res);
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

  const trustedEmail = await getTrustedPrimaryAdminEmail(adminUserId);

  await createAndSendOtp({
    adminUserId,
    adminEmailId: trustedEmail.id,
    recipientType: 'login_email',
    purpose: 'sensitive_action',
    recipientEmail: trustedEmail.email,
  });

  res.status(202).json({
    message: 'A verification code has been sent to the trusted primary login email.',
  });
}

export async function verifyPrimaryEmailChange(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = getValidatedParams<{ id: string }>(res);
  const { code } = getValidatedBody<{ code: string }>(res);

  const admin = getAdmin(res);
  const trustedEmail = await getTrustedPrimaryAdminEmail(admin.id);
  const metadata = requestMetadata(req);

  const changed = await verifyPrimaryAdminEmail(
    admin.id,
    id,
    trustedEmail.id,
    code,
    metadata.ipAddress,
    metadata.userAgent,
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

  void notifyAdminSecurityEvent(
    admin.id,
    admin.email,
    'The primary login email for your administrator account was changed.',
  );

  res.status(200).json({
    message: 'Primary login email changed successfully.',
  });
}

export async function deleteEmail(
  req: Request,
  res: Response,
): Promise<void> {
  const admin = getAdmin(res);
  const { id } = getValidatedParams<{ id: string }>(res);
  const { currentPassword, verificationCode } = getValidatedBody<{
    currentPassword: string;
    verificationCode?: string;
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

  const metadata = requestMetadata(req);
  const removed = await removeAdminEmail(
    admin.id,
    id,
    admin.emailId,
    passwordHash,
    verificationCode,
    metadata.ipAddress,
    metadata.userAgent,
  );

  if (!removed) {
    res.status(409).json({
      error: {
        code: 'EMAIL_REMOVAL_FAILED',
        message: 'The email cannot be removed, reauthentication failed, or required trusted verification was invalid.',
      },
    });
    return;
  }

  void notifyAdminSecurityEvent(
    admin.id,
    admin.email,
    'A login email was removed from your administrator account.',
  );

  res.status(200).json({
    message: 'Login email removed successfully.',
  });
}
