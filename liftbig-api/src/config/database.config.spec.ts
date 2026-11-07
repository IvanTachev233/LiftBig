import PgConnectionParameters from 'pg/lib/connection-parameters';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { databaseConfigFromEnv } from './database.config';

const local = {
  DB_USERNAME: 'local-user',
  DB_PASSWORD: 'local-password',
  DB_NAME: 'local-db',
};
const config = (env: NodeJS.ProcessEnv) =>
  databaseConfigFromEnv(env) as PostgresConnectionOptions;

describe('databaseConfigFromEnv', () => {
  it('uses the DB_* values, with host and port defaulting to the compose database', () => {
    expect(config(local)).toMatchObject({
      host: 'localhost',
      port: 5433,
      username: 'local-user',
      password: 'local-password',
      database: 'local-db',
    });
    expect(
      config({ ...local, DB_HOST: 'postgres', DB_PORT: '5432' }),
    ).toMatchObject({ host: 'postgres', port: 5432 });
  });

  it('stops without a user, password or database name, naming the variable', () => {
    for (const name of ['DB_USERNAME', 'DB_PASSWORD', 'DB_NAME']) {
      expect(() => config({ ...local, [name]: undefined })).toThrow(
        `${name} must be set (or DATABASE_URL); see .env.example`,
      );
      expect(() => config({ ...local, [name]: '' })).toThrow(name);
    }
  });

  describe('schema handling (migrations-only, ADR 0022)', () => {
    it('runs migrations and never syncs by default, in any NODE_ENV', () => {
      for (const NODE_ENV of [undefined, 'development', 'test', 'production']) {
        expect(config({ ...local, NODE_ENV })).toMatchObject({
          synchronize: false,
          migrationsRun: true,
        });
      }
    });

    it('syncs only with TYPEORM_SYNC=true', () => {
      expect(config({ ...local, TYPEORM_SYNC: 'true' }).synchronize).toBe(true);
      for (const TYPEORM_SYNC of ['false', 'True', '1', '']) {
        expect(config({ ...local, TYPEORM_SYNC }).synchronize).toBe(false);
      }
    });

    it('skips migrations only with RUN_MIGRATIONS=false', () => {
      expect(config({ ...local, RUN_MIGRATIONS: 'false' }).migrationsRun).toBe(
        false,
      );
      for (const RUN_MIGRATIONS of ['true', 'False', '0', '']) {
        expect(config({ ...local, RUN_MIGRATIONS }).migrationsRun).toBe(true);
      }
    });

    it('keeps the production settings deploy.sh sets', () => {
      expect(
        config({
          ...local,
          NODE_ENV: 'production',
          TYPEORM_SYNC: 'false',
          RUN_MIGRATIONS: 'true',
        }),
      ).toMatchObject({ synchronize: false, migrationsRun: true });
    });
  });

  describe('TLS', () => {
    // What pg ends up using: TypeORM passes url as connectionString and ssl
    // as is (PostgresDriver.createPool), and pg lets TLS parameters in the
    // connection string replace the ssl option. pg ships no types for it.
    const ConnectionParameters = PgConnectionParameters as new (
      config: object,
    ) => {
      host: string;
      user: string;
      password: string;
      database: string;
      ssl: unknown;
    };
    const effective = (env: NodeJS.ProcessEnv) => {
      const { url, ssl } = config(env);
      return new ConnectionParameters({ connectionString: url, ssl });
    };
    const production = (DATABASE_URL: string) => ({
      NODE_ENV: 'production',
      DATABASE_URL,
    });
    const neon =
      'postgresql://app:p%40ss@ep-x.eu-central-1.aws.neon.tech/liftbig';

    it('verifies the server certificate in production when the URL names no TLS mode', () => {
      expect(effective(production(neon)).ssl).toEqual({
        rejectUnauthorized: true,
      });
    });

    it.each([
      'sslmode=disable',
      'sslmode=no-verify',
      'sslmode=prefer',
      'sslmode=require',
      'sslmode=verify-full',
      'sslmode=require&uselibpqcompat=true',
      'sslmode=prefer&uselibpqcompat=true',
      'ssl=0',
      'ssl=false',
      'sslrootcert=/tmp/none.crt',
    ])('verifies it in production whatever the URL says (%s)', (query) => {
      expect(effective(production(`${neon}?${query}`)).ssl).toEqual({
        rejectUnauthorized: true,
      });
    });

    it('keeps the credentials and the other URL parameters', () => {
      const env = production(
        `${neon}?sslmode=require&channel_binding=require&application_name=api`,
      );
      expect(effective(env)).toMatchObject({
        host: 'ep-x.eu-central-1.aws.neon.tech',
        user: 'app',
        password: 'p@ss',
        database: 'liftbig',
      });
      expect(new URL(config(env).url as string).searchParams.toString()).toBe(
        'channel_binding=require&application_name=api',
      );
    });

    it('passes a production URL without TLS parameters through unchanged', () => {
      const url = `${neon}?channel_binding=require`;
      expect(config(production(url)).url).toBe(url);
    });

    it('leaves TLS off locally and the URL as given', () => {
      const url = `${neon}?sslmode=require`;
      expect(config({ DATABASE_URL: url }).url).toBe(url);
      expect(config(local).ssl).toBe(false);
      expect(effective({ DATABASE_URL: neon }).ssl).toBe(false);
    });
  });

  it('needs no DB_* values with DATABASE_URL', () => {
    expect(config({ DATABASE_URL: 'postgres://u:p@db/x' })).toMatchObject({
      url: 'postgres://u:p@db/x',
      host: undefined,
      username: undefined,
      password: undefined,
      database: undefined,
    });
  });
});
