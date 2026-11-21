
import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  next,
) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof Error) {
    console.error('API error:', {
      name: error.name,
      message: error.message,
    });
  } else {
    console.error('API error: An unknown error occurred.');
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
};
