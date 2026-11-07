import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

// This file is read before @nestjs/config loads .env, so it loads .env itself;
// variables already in the environment win
if (existsSync('.env')) loadEnvFile();

/**
 * Connection settings from DATABASE_URL, or else from DB_HOST/DB_PORT
 * (default: the compose database on localhost:5433) and DB_USERNAME,
 * DB_PASSWORD and DB_NAME, which have no default: a missing one throws.
 *
 * The schema changes only through migrations, in every environment
 * pending ones run on startup unless RUN_MIGRATIONS=false, and
 * synchronize is on only with TYPEORM_SYNC=true.
 *
 * In production the connection always uses TLS and verifies the server
 * certificate against Node's CAs, whatever DATABASE_URL says: pg lets TLS
 * parameters in a connection string replace the ssl option, so they are
 * removed from the URL first (productionUrl).
 */
export function databaseConfigFromEnv(
  env: NodeJS.ProcessEnv,
): TypeOrmModuleOptions {
  const production = env.NODE_ENV === 'production';
  const url =
    production && env.DATABASE_URL
      ? productionUrl(env.DATABASE_URL)
      : env.DATABASE_URL;
  return {
    type: 'postgres',
    url,
    host: url ? undefined : env.DB_HOST || 'localhost',
    port: url ? undefined : parseInt(env.DB_PORT || '5433', 10),
    username: url ? undefined : required(env, 'DB_USERNAME'),
    password: url ? undefined : required(env, 'DB_PASSWORD'),
    database: url ? undefined : required(env, 'DB_NAME'),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsRun: env.RUN_MIGRATIONS !== 'false',
    synchronize: env.TYPEORM_SYNC === 'true',
    retryAttempts: 3,
    retryDelay: 3000,
    ssl: production ? { rejectUnauthorized: true } : false,
  };
}

// Connection string parameters pg-connection-string turns into TLS settings
// (ssl, sslmode, uselibpqcompat, and the certificate files).
const TLS_PARAMS = [
  'ssl',
  'sslmode',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'uselibpqcompat',
];

// DATABASE_URL without its TLS parameters, so the ssl option decides. A URL
// that has none is returned as it is.
function productionUrl(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    // Never echo the value: it holds the password
    throw new Error('DATABASE_URL is not a valid URL');
  }
  const present = TLS_PARAMS.filter((name) => url.searchParams.has(name));
  if (present.length === 0) return databaseUrl;
  for (const name of present) url.searchParams.delete(name);
  return url.toString();
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} must be set (or DATABASE_URL); see .env.example`);
  }
  return value;
}

export const databaseConfig = databaseConfigFromEnv(process.env);
