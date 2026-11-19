import { MigrationInterface, QueryRunner } from 'typeorm';

// feature_flag: one row per (user, flag) (L3a; see notes/spec.md § Tier 3
// Vision pilot). No row, or enabled=false, means the flag is off.

export class FeatureFlags1795069488481 implements MigrationInterface {
  name = 'FeatureFlags1795069488481';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "feature_flag" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "flag" character varying NOT NULL, "enabled" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL, CONSTRAINT "UQ_18a237ebd10e5cb06c2a74a27f7" UNIQUE ("userId", "flag"), CONSTRAINT "PK_f390205410d884907604a90c0f4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "feature_flag" ADD CONSTRAINT "FK_34e9724f27e56fcc441f6e980b5" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "feature_flag" DROP CONSTRAINT "FK_34e9724f27e56fcc441f6e980b5"`,
    );
    await queryRunner.query(`DROP TABLE "feature_flag"`);
  }
}
