import { MigrationInterface, QueryRunner } from 'typeorm';

// Demo media keys on exercise (ADR 0026): object keys in the public media
// bucket, set by the seeder for globals; the API sends them as URLs.

export class ExerciseMediaKeys1794049431805 implements MigrationInterface {
  name = 'ExerciseMediaKeys1794049431805';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "exercise" ADD "videoKey" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "exercise" ADD "imageKey" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "exercise" DROP COLUMN "imageKey"`);
    await queryRunner.query(`ALTER TABLE "exercise" DROP COLUMN "videoKey"`);
  }
}
