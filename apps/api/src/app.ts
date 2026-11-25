
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { requireTrustedOrigin } from './middleware/trusted-origin.js';

import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { requestLogger } from './middleware/request-logger.js';
import apiRouter from './routes/index.js';

const app = express();

app.disable('x-powered-by');

app.use(helmet());

app.use(
  cors({
    origin: new URL(env.FRONTEND_URL).origin,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }),
);

app.use(requestIdMiddleware);
app.use(requestLogger);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/api', requireTrustedOrigin);

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'portfolio-api',
  });
});

app.use('/api', apiRouter);

app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
    },
  });
});

app.use(errorHandler);

export default app;
