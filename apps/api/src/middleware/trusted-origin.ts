
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

const trustedOrigin = new URL(env.FRONTEND_URL).origin;

const SAFE_METHODS = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
]);

export const requireTrustedOrigin: RequestHandler = (
  req,
  res,
  next,
) => {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const origin = req.get('origin');

  if (!origin || origin !== trustedOrigin) {
    res.status(403).json({
      error: {
        code: 'UNTRUSTED_ORIGIN',
        message: 'This request origin is not permitted.',
      },
    });
    return;
  }

  next();
};
