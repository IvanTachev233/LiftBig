import { MigrationInterface, QueryRunner } from 'typeorm';
import { Baseline1794009600000 } from '../migrations/1794009600000-Baseline';
import { BodyPart } from '../workouts/entities/exercise.entity';

// Lives outside src/migrations, whose glob loads every .ts file as a
// migration. The runner fakes the two reads the Baseline makes (tables in
// public, and the migrations row of 0012) and records everything else; the
// DDL itself is checked against a real database (A6b: migration:run, then
// migration:generate --check).

const LAST_SQUASHED = 'BugReports1709800000012';

const SCHEMA_TABLES = [
  'auth_session',
  'bug_report',
  'consent_event',
  'email_code',
  'exercise',
  'invite',
  'policy_acceptance',
  'program_enrollment',
  'program_template',
  'program_template_exercise',
  'program_template_session',
  'rep_max_entry',
  'sport',
  'sport_required_lift',
  'user',
  'user_best_lift',
  'workout',
  'workout_exercise',
  'workout_set',
];

// The 13 global exercises of 0001, with its body parts
const GLOBAL_EXERCISES: [string, BodyPart][] = [
  ['Clean', BodyPart.FULL_BODY],
  ['Jerk', BodyPart.FULL_BODY],
  ['Clean and Jerk', BodyPart.FULL_BODY],
  ['Power Clean', BodyPart.FULL_BODY],
  ['Power Jerk', BodyPart.FULL_BODY],
  ['Power Clean and Jerk', BodyPart.FULL_BODY],
  ['Power Clean and Power Jerk', BodyPart.FULL_BODY],
  ['Snatch', BodyPart.FULL_BODY],
  ['Power Snatch', BodyPart.FULL_BODY],
  ['Clean Pull', BodyPart.LEGS],
  ['Snatch Pull', BodyPart.LEGS],
  ['Back Squat', BodyPart.LEGS],
  ['Front Squat', BodyPart.LEGS],
];

interface FakeDatabase {
  tables: string[];
  executed: string[];
}

function fakeRunner(db: FakeDatabase) {
  const query = jest.fn((text: string, params?: unknown[]) => {
    if (text.includes('information_schema.tables')) {
      return Promise.resolve(db.tables.map((name) => ({ table_name: name })));
    }
    if (/FROM "migrations"/.test(text)) {
      const found = db.executed.includes(String(params?.[0]));
      return Promise.resolve(found ? [{ found: 1 }] : []);
    }
    return Promise.resolve([]);
  });
  return { runner: { query } as unknown as QueryRunner, query };
}

function calls(query: jest.Mock): { sql: string; params?: unknown[] }[] {
  return query.mock.calls.map(([text, params]: [string, unknown[]?]) => ({
    sql: String(text).replace(/\s+/g, ' ').trim(),
    params,
  }));
}

// Statements other than the Baseline's own reads
function writes(query: jest.Mock): string[] {
  return calls(query)
    .map((c) => c.sql)
    .filter((sql) => !/^SELECT /.test(sql));
}

function createdTables(query: jest.Mock): string[] {
  return writes(query)
    .map((sql) => /^CREATE TABLE "([^"]+)"/.exec(sql)?.[1])
    .filter((name): name is string => !!name)
    .sort();
}

describe('Baseline1794009600000', () => {
  // Typed as TypeORM calls it, with a query runner
  const migration: MigrationInterface = new Baseline1794009600000();

  describe('on an empty database', () => {
    it('creates every table of the schema', async () => {
      const { runner, query } = fakeRunner({
        tables: ['migrations'],
        executed: [],
      });
      await migration.up(runner);
      expect(createdTables(query)).toEqual(SCHEMA_TABLES);
    });

    it('counts typeorm_metadata as empty too', async () => {
      const { runner, query } = fakeRunner({
        tables: ['migrations', 'typeorm_metadata'],
        executed: [],
      });
      await migration.up(runner);
      expect(createdTables(query)).toEqual(SCHEMA_TABLES);
    });

    it("keeps 0012's names for the bug_report key, index and foreign key", async () => {
      const { runner, query } = fakeRunner({
        tables: ['migrations'],
        executed: [],
      });
      await migration.up(runner);
      const sql = writes(query).join('\n');
      expect(sql).toContain('CONSTRAINT "PK_bug_report_id" PRIMARY KEY ("id")');
      expect(sql).toContain(
        'CREATE INDEX "IDX_bug_report_user_created" ON "bug_report" ("userId", "createdAt")',
      );
      expect(sql).toContain(
        'ALTER TABLE "bug_report" ADD CONSTRAINT "FK_bug_report_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE',
      );
    });

    it('inserts the 13 global exercises after creating the tables', async () => {
      const { runner, query } = fakeRunner({
        tables: ['migrations'],
        executed: [],
      });
      await migration.up(runner);
      const all = calls(query).filter((c) => !/^SELECT /.test(c.sql));
      const inserts = all.filter((c) => c.sql.startsWith('INSERT INTO'));

      expect(inserts.map((c) => c.params)).toEqual(GLOBAL_EXERCISES);
      for (const insert of inserts) {
        expect(insert.sql).toMatch(
          /^INSERT INTO "exercise" \("id", "name", "bodyPart"\)/,
        );
        expect(insert.sql).toContain(
          'WHERE NOT EXISTS ( SELECT 1 FROM "exercise" WHERE "name" = $1 AND "createdById" IS NULL )',
        );
      }
      const firstInsert = all.indexOf(inserts[0]);
      expect(all.slice(firstInsert)).toEqual(inserts);
    });
  });

  describe(`on a database that ran ${LAST_SQUASHED}`, () => {
    it('changes nothing', async () => {
      const { runner, query } = fakeRunner({
        tables: ['migrations', 'typeorm_metadata', ...SCHEMA_TABLES],
        executed: ['MockUser1709800000000', LAST_SQUASHED],
      });
      await migration.up(runner);
      expect(query).toHaveBeenCalled();
      expect(writes(query)).toEqual([]);
    });
  });

  describe(`on a database with tables but without ${LAST_SQUASHED}`, () => {
    it.each([
      ['built by synchronize', []],
      [
        'half-migrated',
        ['MockUser1709800000000', 'DisableSeedAccounts1709800000011'],
      ],
    ])('throws before any change (%s)', async (_case, executed) => {
      const { runner, query } = fakeRunner({
        tables: ['migrations', 'user', 'exercise'],
        executed,
      });
      await expect(migration.up(runner)).rejects.toThrow(
        `Baseline: 2 tables exist but ${LAST_SQUASHED} is not recorded; nothing was changed`,
      );
      expect(writes(query)).toEqual([]);
    });
  });

  it('down throws and changes nothing', async () => {
    const { runner, query } = fakeRunner({
      tables: ['migrations', ...SCHEMA_TABLES],
      executed: [LAST_SQUASHED],
    });
    await expect(migration.down(runner)).rejects.toThrow(
      "Baseline can't be reverted; restore the database from a Neon branch",
    );
    expect(query).not.toHaveBeenCalled();
  });
});
