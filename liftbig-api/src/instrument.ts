import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { initSentry } from './common/sentry';

// Imported first in main.ts: Sentry has to start before Nest and Express are
// loaded. Like database.config.ts, it runs before @nestjs/config reads .env.
if (existsSync('.env')) loadEnvFile();
initSentry(process.env);
