
import type { ErrorRequestHandler } from 'express';
import { ApiError } from '../lib/errors/api-error.js';
import { logger } from '../lib/logger.js';

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  next,
) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  if (error instanceof Error) {
    logger.error(
      {
        err: error,
        requestId: res.locals.requestId,
      },
      'Unhandled API error',
    );
  } else {
    logger.error(
      {
        requestId: res.locals.requestId,
      },
      'Unknown API error',
    );
  }

  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
};
