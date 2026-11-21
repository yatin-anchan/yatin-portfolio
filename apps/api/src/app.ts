
import express from 'express';
import { errorHandler } from './middleware/error-handler.js';

const app = express();

app.disable('x-powered-by');

app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'portfolio-api',
  });
});

// Handle unknown routes.
app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
    },
  });
});

// Centralized error handling must be last.
app.use(errorHandler);

export default app;
