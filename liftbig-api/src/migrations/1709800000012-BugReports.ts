import { MigrationInterface, QueryRunner } from 'typeorm';

// Creates the bug_report table exactly as synchronize would for the
// BugReport entity (LB-38), so sync finds nothing to change afterwards. A
// database without the user table, or one where sync already created
// bug_report, is skipped.
export class BugReports1709800000012 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('user'))) return;
    if (await queryRunner.hasTable('bug_report')) return;

    await queryRunner.query(
      `CREATE TABLE "bug_report" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "description" text NOT NULL,
        "steps" text,
        "appVersion" character varying,
        "versionCode" integer,
        "platform" character varying NOT NULL,
        "osVersion" character varying,
        "deviceModel" character varying,
        "role" character varying NOT NULL,
        "screenshotNames" text,
        "githubIssueNumber" integer,
        "githubStatus" character varying NOT NULL DEFAULT 'pending',
        "createdAt" TIMESTAMP NOT NULL,
        CONSTRAINT "PK_bug_report_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bug_report_user_created" ON "bug_report" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "bug_report" ADD CONSTRAINT "FK_bug_report_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bug_report"`);
  }
}
