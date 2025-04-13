import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutoMigration1744580680243 implements MigrationInterface {
  name = 'AutoMigration1744580680243';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP COLUMN "initial_balance"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD "initial_balance" integer NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP COLUMN "initial_balance"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD "initial_balance" numeric(10,2) NOT NULL`,
    );
  }
}
