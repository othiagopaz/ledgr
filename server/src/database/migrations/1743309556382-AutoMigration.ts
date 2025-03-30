import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutoMigration1743309556382 implements MigrationInterface {
  name = 'AutoMigration1743309556382';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "is_refundable"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "is_shared"`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN "credit_card_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN "ownership_type"`,
    );
    await queryRunner.query(`DROP TYPE "public"."events_ownership_type_enum"`);
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN "refund_installments"`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN "refund_installment_dates"`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN "is_off_balance"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_ownership_enum" AS ENUM('OWN', 'REFUNDABLE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "ownership" "public"."transactions_ownership_enum" NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_type_enum" AS ENUM('INCOME', 'EXPENSE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "type" "public"."transactions_type_enum" NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "type"`);
    await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "ownership"`,
    );
    await queryRunner.query(`DROP TYPE "public"."transactions_ownership_enum"`);
    await queryRunner.query(
      `ALTER TABLE "events" ADD "is_off_balance" boolean NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD "refund_installment_dates" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD "refund_installments" integer`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."events_ownership_type_enum" AS ENUM('OWN', 'SHARED', 'REFUNDABLE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD "ownership_type" "public"."events_ownership_type_enum" NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD "credit_card_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "is_shared" boolean`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "is_refundable" boolean`,
    );
  }
}
