
import { loadEnvFile } from 'node:process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const rootEnvPath = resolve(currentDirectory, '../../../.env');

loadEnvFile(rootEnvPath);

const { env } = await import('./config/env.js');
const { default: app } = await import('./app.js');
const { pool } = await import('@yatin-portfolio/database');

const server = app.listen(env.PORT, () => {
  console.log(`Portfolio API listening on port ${env.PORT}`);
});

let isShuttingDown = false;

function shutdown(signal: string): void {
  if (isShuttingDown) return;

  isShuttingDown = true;

  console.log(`${signal} received. Shutting down...`);

  server.close(async (error) => {
    if (error) {
      console.error('HTTP server shutdown failed:', error);
      process.exitCode = 1;
    }

    try {
      await pool.end();
      console.log('Database connection pool closed.');
    } catch (databaseError) {
      console.error('Database pool shutdown failed:', databaseError);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
