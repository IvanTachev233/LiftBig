import { MigrationInterface, QueryRunner } from 'typeorm';

// Replaces migrations 0000–0012 (ADR 0022; git keeps the old files). Frozen
// at the schema as of BugReports1709800000012: later changes go in new
// migrations, and new global exercises go in the bootstrap seeder.
//
// - Empty database (no table but migrations and typeorm_metadata): creates
//   the schema, then the 13 global exercises of 0001.
// - Database that ran BugReports1709800000012: changes nothing; TypeORM
//   records this migration.
// - Anything else (tables without that row): throws before any change, so
//   the transaction rolls back and nothing is recorded.

const LAST_SQUASHED = 'BugReports1709800000012';
const IGNORED_TABLES = ['migrations', 'typeorm_metadata'];

// What migration:generate produced from the entities against an empty
// database (TypeORM 0.3.31), statement for statement
const SCHEMA = [
  `CREATE TYPE "public"."exercise_bodypart_enum" AS ENUM('CH', 'BK', 'LG', 'SH', 'AR', 'CO', 'FB', 'OT')`,
  `CREATE TABLE "exercise" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying, "bodyPart" "public"."exercise_bodypart_enum" NOT NULL DEFAULT 'OT', "category" character varying, "equipment" character varying, "createdById" uuid, "videoUrl" character varying, "imageUrl" character varying, "isMaxTrackable" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_0b01474712485ae56be462c02f3" UNIQUE ("name", "createdById"), CONSTRAINT "PK_a0f107e3a2ef2742c1e91d97c14" PRIMARY KEY ("id"))`,
  `CREATE TABLE "program_template_exercise" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sessionId" uuid NOT NULL, "exerciseId" uuid NOT NULL, "order" integer NOT NULL, "sets" integer NOT NULL, "reps" integer NOT NULL, "percentOf1RM" numeric(5,2), "referenceExerciseId" uuid, "notes" text, CONSTRAINT "CHK_03fe5d72a2d88dbe60fe57318d" CHECK (("percentOf1RM" IS NULL) = ("referenceExerciseId" IS NULL)), CONSTRAINT "PK_8bceb3c8d7b2a8daab86d2f0ad9" PRIMARY KEY ("id"))`,
  `CREATE TABLE "program_template_session" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "programId" uuid NOT NULL, "week" integer NOT NULL, "sessionIndex" integer NOT NULL, "dayOffset" integer NOT NULL, "title" character varying NOT NULL, "notes" text, CONSTRAINT "UQ_37b6df0dd197d7b48f1ecd44079" UNIQUE ("programId", "week", "sessionIndex"), CONSTRAINT "PK_8c2c60efef9b74915b2c50fbb25" PRIMARY KEY ("id"))`,
  `CREATE TABLE "sport_required_lift" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sportId" uuid NOT NULL, "exerciseId" uuid NOT NULL, "label" character varying NOT NULL, "displayOrder" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_2e5b9a07751d6cf53c544a9cddc" UNIQUE ("sportId", "exerciseId"), CONSTRAINT "PK_c2dceecde20440e39853a5c6489" PRIMARY KEY ("id"))`,
  `CREATE TABLE "sport" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "displayOrder" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_6a16e1d83cb581484036cee92bf" UNIQUE ("name"), CONSTRAINT "PK_c67275331afac347120a1032825" PRIMARY KEY ("id"))`,
  `CREATE TYPE "public"."program_template_status_enum" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED')`,
  `CREATE TABLE "program_template" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "lineageId" uuid NOT NULL, "version" integer NOT NULL, "sportId" uuid NOT NULL, "name" character varying NOT NULL, "description" text, "durationWeeks" integer NOT NULL, "sessionsPerWeek" integer NOT NULL, "authorId" uuid, "status" "public"."program_template_status_enum" NOT NULL DEFAULT 'DRAFT', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_96e76c795d2bb674f8faf720b14" UNIQUE ("lineageId", "version"), CONSTRAINT "PK_52ea8bf06dd1cb2c4c597e40f85" PRIMARY KEY ("id"))`,
  `CREATE TYPE "public"."program_enrollment_status_enum" AS ENUM('ACTIVE', 'COMPLETED', 'ABANDONED')`,
  `CREATE TABLE "program_enrollment" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "programId" uuid NOT NULL, "programVersion" integer NOT NULL, "startDate" date NOT NULL, "status" "public"."program_enrollment_status_enum" NOT NULL DEFAULT 'ACTIVE', "maxesSnapshot" jsonb NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_095cea9209f4d05e220c0f9de9d" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX "IDX_0a68a6a24bcf534235af76eeb7" ON "program_enrollment" ("userId") WHERE "status" = 'ACTIVE'`,
  `CREATE TABLE "workout_set" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workoutExerciseId" uuid NOT NULL, "reps" integer NOT NULL, "weight" numeric(6,2), "prescribedPercent" numeric(5,2), "referenceExerciseId" uuid, "actualReps" integer, "actualWeight" numeric(6,2), "made" boolean, "notes" character varying, "order" integer NOT NULL, CONSTRAINT "PK_940e796aafe89c44190ff0559c7" PRIMARY KEY ("id"))`,
  `CREATE TABLE "workout_exercise" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workoutId" uuid NOT NULL, "exerciseId" uuid NOT NULL, "order" integer NOT NULL, "supersetGroup" uuid, "notes" character varying, CONSTRAINT "PK_9598996a913c5f5114f9e6403b6" PRIMARY KEY ("id"))`,
  `CREATE TYPE "public"."workout_status_enum" AS ENUM('PLANNED', 'IN_PROGRESS', 'COMPLETED')`,
  `CREATE TABLE "workout" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "assignedById" uuid, "programEnrollmentId" uuid, "programSessionId" uuid, "date" TIMESTAMP NOT NULL, "name" character varying NOT NULL, "notes" character varying, "isTemplate" boolean NOT NULL DEFAULT false, "totalWeightLifted" numeric NOT NULL DEFAULT '0', "status" "public"."workout_status_enum" NOT NULL DEFAULT 'PLANNED', "startedAt" TIMESTAMP, CONSTRAINT "PK_ea37ec052825688082b19f0d939" PRIMARY KEY ("id"))`,
  `CREATE TYPE "public"."user_weightunit_enum" AS ENUM('kg', 'lb')`,
  `CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "name" character varying, "passwordHash" character varying NOT NULL, "role" character varying NOT NULL DEFAULT 'CLIENT', "weightUnit" "public"."user_weightunit_enum" NOT NULL DEFAULT 'kg', "restSeconds" integer NOT NULL DEFAULT '120', "tokenVersion" integer NOT NULL DEFAULT '0', "failedPasswordAttempts" integer NOT NULL DEFAULT '0', "passwordLockedUntil" TIMESTAMP, "emailVerifiedAt" TIMESTAMP, "coachId" uuid, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
  `CREATE TABLE "policy_acceptance" ("id" SERIAL NOT NULL, "userId" uuid NOT NULL, "document" character varying NOT NULL, "version" character varying NOT NULL, "acceptedAt" TIMESTAMP NOT NULL, "source" character varying NOT NULL, "appVersionCode" integer, CONSTRAINT "PK_f1cade691bebad842497ce27c34" PRIMARY KEY ("id"))`,
  `CREATE INDEX "IDX_9f4bc360bf0a095ab39282faac" ON "policy_acceptance" ("userId")`,
  `CREATE TABLE "consent_event" ("id" SERIAL NOT NULL, "userId" uuid NOT NULL, "purpose" character varying NOT NULL, "granted" boolean NOT NULL, "textVersion" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL, "source" character varying NOT NULL, CONSTRAINT "PK_da129f04a16b45855a0ebb5ed68" PRIMARY KEY ("id"))`,
  `CREATE INDEX "IDX_4d5a51cd2e1b0324ea4abff71c" ON "consent_event" ("userId")`,
  `CREATE TYPE "public"."email_code_purpose_enum" AS ENUM('VERIFY_EMAIL', 'RESET_PASSWORD')`,
  `CREATE TABLE "email_code" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "purpose" "public"."email_code_purpose_enum" NOT NULL, "codeHash" character varying NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "attempts" integer NOT NULL DEFAULT '0', "usedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d2df8df5dfc4063f18fb7a576da" PRIMARY KEY ("id"))`,
  `CREATE INDEX "IDX_84c6584246693e4e3057a41bdb" ON "email_code" ("userId", "purpose", "createdAt")`,
  `CREATE TABLE "bug_report" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "description" text NOT NULL, "steps" text, "appVersion" character varying, "versionCode" integer, "platform" character varying NOT NULL, "osVersion" character varying, "deviceModel" character varying, "role" character varying NOT NULL, "screenshotNames" text, "githubIssueNumber" integer, "githubStatus" character varying NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_bug_report_id" PRIMARY KEY ("id"))`,
  `CREATE INDEX "IDX_bug_report_user_created" ON "bug_report" ("userId", "createdAt")`,
  `CREATE TABLE "invite" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "coachId" uuid NOT NULL, "clientEmail" character varying NOT NULL, "token" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP NOT NULL, CONSTRAINT "UQ_83dbe83cb33c3e8468c8045ea7c" UNIQUE ("token"), CONSTRAINT "PK_fc9fa190e5a3c5d80604a4f63e1" PRIMARY KEY ("id"))`,
  `CREATE TABLE "auth_session" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "tokenHash" character varying NOT NULL, "previousHash" character varying, "rotatedAt" TIMESTAMP, "tokenVersion" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL, "lastUsedAt" TIMESTAMP NOT NULL, "idleExpiresAt" TIMESTAMP NOT NULL, "absoluteExpiresAt" TIMESTAMP NOT NULL, "revokedAt" TIMESTAMP, CONSTRAINT "PK_19354ed146424a728c1112a8cbf" PRIMARY KEY ("id"))`,
  `CREATE INDEX "IDX_c072b729d71697f959bde66ade" ON "auth_session" ("userId")`,
  `CREATE UNIQUE INDEX "IDX_91b0ea197ef5e65be48c624aae" ON "auth_session" ("tokenHash")`,
  `CREATE INDEX "IDX_79479d08ea0f7a335991a846fa" ON "auth_session" ("previousHash")`,
  `CREATE TYPE "public"."user_best_lift_unit_enum" AS ENUM('kg', 'lb')`,
  `CREATE TYPE "public"."user_best_lift_source_enum" AS ENUM('MANUAL', 'LOGGED_SET', 'PROGRAM_SETUP')`,
  `CREATE TABLE "user_best_lift" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "exerciseId" uuid NOT NULL, "weightKg" numeric(6,2) NOT NULL, "unit" "public"."user_best_lift_unit_enum" NOT NULL DEFAULT 'kg', "achievedOn" date NOT NULL, "source" "public"."user_best_lift_source_enum" NOT NULL, CONSTRAINT "UQ_bb12f5f74adde538de8e0bddb7a" UNIQUE ("userId", "exerciseId"), CONSTRAINT "PK_10216ec358961d6beadad0b37b5" PRIMARY KEY ("id"))`,
  `CREATE TYPE "public"."rep_max_entry_unit_enum" AS ENUM('kg', 'lb')`,
  `CREATE TYPE "public"."rep_max_entry_source_enum" AS ENUM('MANUAL', 'LOGGED_SET', 'PROGRAM_SETUP')`,
  `CREATE TABLE "rep_max_entry" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "exerciseId" uuid NOT NULL, "reps" integer NOT NULL, "weightKg" numeric(6,2) NOT NULL, "unit" "public"."rep_max_entry_unit_enum" NOT NULL DEFAULT 'kg', "achievedOn" date NOT NULL, "source" "public"."rep_max_entry_source_enum" NOT NULL, "workoutSetId" uuid, "removedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "seq" BIGSERIAL NOT NULL, CONSTRAINT "UQ_4d0df85a108789da9b1477bb56b" UNIQUE ("workoutSetId"), CONSTRAINT "CHK_efde2e99ef12a6ac82b0978fba" CHECK ("reps" >= 1), CONSTRAINT "PK_c52d4305c1abd2a587c5c523dc6" PRIMARY KEY ("id"))`,
  `ALTER TABLE "exercise" ADD CONSTRAINT "FK_6a3fcb35ca9190cea7a0cebc177" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
  `ALTER TABLE "program_template_exercise" ADD CONSTRAINT "FK_8a0281b4eb83f6934b92fdbc84a" FOREIGN KEY ("sessionId") REFERENCES "program_template_session"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "program_template_exercise" ADD CONSTRAINT "FK_b8dc3684b4627d73c2d94043d59" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
  `ALTER TABLE "program_template_exercise" ADD CONSTRAINT "FK_58a7b92ff391dc733005a63a6f0" FOREIGN KEY ("referenceExerciseId") REFERENCES "exercise"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
  `ALTER TABLE "program_template_session" ADD CONSTRAINT "FK_3c1a36c57f4b579c941fefa6b2f" FOREIGN KEY ("programId") REFERENCES "program_template"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "sport_required_lift" ADD CONSTRAINT "FK_54ba3caa14ab9978328d852e483" FOREIGN KEY ("sportId") REFERENCES "sport"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "sport_required_lift" ADD CONSTRAINT "FK_9df6a20210de46003c6f34a27fc" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
  `ALTER TABLE "program_template" ADD CONSTRAINT "FK_b7154e3def382df86e893931ac3" FOREIGN KEY ("sportId") REFERENCES "sport"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
  `ALTER TABLE "program_template" ADD CONSTRAINT "FK_0fda3a3b13d620510be0f8cf818" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
  `ALTER TABLE "program_enrollment" ADD CONSTRAINT "FK_52da0cfbce4491b7a0b58571182" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "program_enrollment" ADD CONSTRAINT "FK_375e5b08376491033254d2849c8" FOREIGN KEY ("programId") REFERENCES "program_template"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
  `ALTER TABLE "workout_set" ADD CONSTRAINT "FK_03a3bdfb65d662cfdc38cf584f6" FOREIGN KEY ("workoutExerciseId") REFERENCES "workout_exercise"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "workout_set" ADD CONSTRAINT "FK_3f158cca6148e75163a193ea151" FOREIGN KEY ("referenceExerciseId") REFERENCES "exercise"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
  `ALTER TABLE "workout_exercise" ADD CONSTRAINT "FK_35fe273716366d768fba9964813" FOREIGN KEY ("workoutId") REFERENCES "workout"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "workout_exercise" ADD CONSTRAINT "FK_a2ac7d92eeb9bd5fc2bb9896611" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
  `ALTER TABLE "workout" ADD CONSTRAINT "FK_5c6e4714ac75eab49d2009f956c" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
  `ALTER TABLE "workout" ADD CONSTRAINT "FK_2f1cdaf76f3ed6ba6f769f107ec" FOREIGN KEY ("assignedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
  `ALTER TABLE "workout" ADD CONSTRAINT "FK_536300c8fa80520b1e2f28191ca" FOREIGN KEY ("programEnrollmentId") REFERENCES "program_enrollment"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
  `ALTER TABLE "workout" ADD CONSTRAINT "FK_eef21412a511ffaba47689c6a04" FOREIGN KEY ("programSessionId") REFERENCES "program_template_session"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
  `ALTER TABLE "user" ADD CONSTRAINT "FK_e5eab302deb1aded146a15984e7" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
  `ALTER TABLE "policy_acceptance" ADD CONSTRAINT "FK_9f4bc360bf0a095ab39282faac3" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "consent_event" ADD CONSTRAINT "FK_4d5a51cd2e1b0324ea4abff71c6" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "email_code" ADD CONSTRAINT "FK_9c81d346ea444b9ff7f38115dc6" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "bug_report" ADD CONSTRAINT "FK_bug_report_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "invite" ADD CONSTRAINT "FK_29ee42f84f1f27e1a309a1e12ec" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
  `ALTER TABLE "auth_session" ADD CONSTRAINT "FK_c072b729d71697f959bde66ade0" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "user_best_lift" ADD CONSTRAINT "FK_773a0b3729498f8c24eb66a127a" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "user_best_lift" ADD CONSTRAINT "FK_4763568afcdf7c480960541a2be" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
  `ALTER TABLE "rep_max_entry" ADD CONSTRAINT "FK_6a04c0affc95790200e9b6b1115" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
  `ALTER TABLE "rep_max_entry" ADD CONSTRAINT "FK_329d97c02c9c388b49e4b35947a" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
  `ALTER TABLE "rep_max_entry" ADD CONSTRAINT "FK_4d0df85a108789da9b1477bb56b" FOREIGN KEY ("workoutSetId") REFERENCES "workout_set"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
];

// [name, bodyPart]: 'FB' full body, 'LG' legs. The seeder fills in category
// and equipment from src/programs/seed/exercises.json on the next start.
const GLOBAL_EXERCISES: [string, string][] = [
  ['Clean', 'FB'],
  ['Jerk', 'FB'],
  ['Clean and Jerk', 'FB'],
  ['Power Clean', 'FB'],
  ['Power Jerk', 'FB'],
  ['Power Clean and Jerk', 'FB'],
  ['Power Clean and Power Jerk', 'FB'],
  ['Snatch', 'FB'],
  ['Power Snatch', 'FB'],
  ['Clean Pull', 'LG'],
  ['Snatch Pull', 'LG'],
  ['Back Squat', 'LG'],
  ['Front Squat', 'LG'],
];

export class Baseline1794009600000 implements MigrationInterface {
  name = 'Baseline1794009600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    )) as { table_name: string }[];
    const tables = rows
      .map((row) => row.table_name)
      .filter((name) => !IGNORED_TABLES.includes(name));

    if (tables.length === 0) {
      for (const statement of SCHEMA) await queryRunner.query(statement);
      for (const [name, bodyPart] of GLOBAL_EXERCISES) {
        // A unique constraint can't dedupe globals (createdById is null)
        await queryRunner.query(
          `INSERT INTO "exercise" ("id", "name", "bodyPart")
           SELECT uuid_generate_v4(), $1::varchar, $2::"public"."exercise_bodypart_enum"
           WHERE NOT EXISTS (
             SELECT 1 FROM "exercise" WHERE "name" = $1 AND "createdById" IS NULL
           )`,
          [name, bodyPart],
        );
      }
      return;
    }

    const recorded = (await queryRunner.query(
      `SELECT 1 FROM "migrations" WHERE "name" = $1`,
      [LAST_SQUASHED],
    )) as unknown[];
    if (recorded.length > 0) return;

    throw new Error(
      `Baseline: ${tables.length} tables exist but ${LAST_SQUASHED} is not recorded; nothing was changed. ` +
        'A database built by synchronize that matches the entities can be marked with "npm run migration:run -- --fake"; otherwise recreate it (ADR 0022).',
    );
  }

  // Dropping every table is the only inverse; migration:revert must never do
  // that to production
  public down(): Promise<void> {
    return Promise.reject(
      new Error(
        "Baseline can't be reverted; restore the database from a Neon branch",
      ),
    );
  }
}
