import { QueryRunner } from 'typeorm';
import { BugReports1709800000012 } from '../migrations/1709800000012-BugReports';

// Lives outside src/migrations, whose glob loads every .ts file as a
// migration. The DDL itself is checked against a copy of a real database.
function fakeRunner(tables: string[]) {
  const query = jest.fn().mockResolvedValue([]);
  const runner = {
    hasTable: jest.fn((name: string) => Promise.resolve(tables.includes(name))),
    query,
  };
  return { runner: runner as unknown as QueryRunner, query };
}

function sql(query: jest.Mock): string[] {
  return query.mock.calls.map(([text]) => String(text).replace(/\s+/g, ' '));
}

describe('BugReports1709800000012', () => {
  const migration = new BugReports1709800000012();

  it('does nothing on a fresh database without the user table', async () => {
    const { runner, query } = fakeRunner([]);
    await migration.up(runner);
    expect(query).not.toHaveBeenCalled();
  });

  it('does nothing when synchronize already created the table', async () => {
    const { runner, query } = fakeRunner(['user', 'bug_report']);
    await migration.up(runner);
    expect(query).not.toHaveBeenCalled();
  });

  it('creates the table, its index and the user foreign key', async () => {
    const { runner, query } = fakeRunner(['user']);
    await migration.up(runner);
    const statements = sql(query);
    expect(statements).toHaveLength(3);
    expect(statements[0]).toMatch(/^CREATE TABLE "bug_report" \(/);
    expect(statements[0]).toContain(
      'CONSTRAINT "PK_bug_report_id" PRIMARY KEY ("id")',
    );
    expect(statements.slice(1)).toEqual([
      'CREATE INDEX "IDX_bug_report_user_created" ON "bug_report" ("userId", "createdAt")',
      'ALTER TABLE "bug_report" ADD CONSTRAINT "FK_bug_report_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    ]);
  });

  it('down drops the table', async () => {
    const { runner, query } = fakeRunner(['user', 'bug_report']);
    await migration.down(runner);
    expect(sql(query)).toEqual(['DROP TABLE IF EXISTS "bug_report"']);
  });
});
