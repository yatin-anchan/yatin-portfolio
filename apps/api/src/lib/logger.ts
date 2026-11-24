
import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',

  timestamp: pino.stdTimeFunctions.isoTime,

  redact: {
    paths: [
      'password',
      '*.password',
      'token',
      '*.token',
      'authorization',
      'cookie',
      'set-cookie',
      '*.email',
    ],
    censor: '[REDACTED]',
  },
});
