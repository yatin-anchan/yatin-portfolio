
import type { RequestHandler } from 'express';
import { z } from 'zod';

export type ValidationTarget = 'body' | 'params' | 'query';

export type ValidatedRequestData = {
  body?: unknown;
  params?: unknown;
  query?: unknown;
};

export function validate(
  schema: z.ZodType,
  target: ValidationTarget = 'body',
): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          details: result.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
            code: issue.code,
          })),
        },
      });
    }

    const validated =
      (res.locals.validated ??= {}) as ValidatedRequestData;

    validated[target] = result.data;

    next();
  };
}
