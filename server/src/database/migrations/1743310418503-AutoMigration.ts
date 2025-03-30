import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutoMigration1743310418503 implements MigrationInterface {
  name = 'AutoMigration1743310418503';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP CONSTRAINT "FK_54ec284da4b957748352c8310c8"`,
    );
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "account_id"`);
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "due_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "due_date" date NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "competence_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "competence_date" date NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "payment_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "payment_date" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN "competenceDate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD "competenceDate" date NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN "competenceDate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD "competenceDate" TIMESTAMP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "payment_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "payment_date" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "competence_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "competence_date" TIMESTAMP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "due_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "due_date" TIMESTAMP NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "events" ADD "account_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "events" ADD CONSTRAINT "FK_54ec284da4b957748352c8310c8" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
