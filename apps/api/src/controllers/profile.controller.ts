import type { Request, Response } from 'express';
import { findProfile } from '../services/profile.service.js';

export async function getProfile(
  _req: Request,
  res: Response,
): Promise<void> {
  const profile = await findProfile();

  if (!profile) {
    res.status(404).json({
      error: {
        code: 'PROFILE_NOT_FOUND',
        message: 'Profile not found.',
      },
    });
    return;
  }

  const {
    isEmailVisible,
    isPhoneVisible,
    email,
    phone,
    ...publicProfile
  } = profile;

  res.status(200).json({
    data: {
      ...publicProfile,
      email: isEmailVisible ? email : null,
      phone: isPhoneVisible ? phone : null,
    },
  });
}