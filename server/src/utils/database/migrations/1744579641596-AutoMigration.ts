import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutoMigration1744579641596 implements MigrationInterface {
  name = 'AutoMigration1744579641596';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."settlements_status_enum" AS ENUM('EXPECTED', 'PAID', 'CANCELED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."settlements_direction_enum" AS ENUM('RECEIVABLE', 'PAYABLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "settlements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "transaction_id" character varying NOT NULL, "negotiator_id" character varying NOT NULL, "amount" integer NOT NULL, "due_date" TIMESTAMP NOT NULL, "status" "public"."settlements_status_enum" NOT NULL DEFAULT 'EXPECTED', "direction" "public"."settlements_direction_enum" NOT NULL, "payment_date" TIMESTAMP, "account_id" character varying, "notes" character varying, CONSTRAINT "PK_5f523ce152b84e818bff9467aab" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "settlements"`);
    await queryRunner.query(`DROP TYPE "public"."settlements_direction_enum"`);
    await queryRunner.query(`DROP TYPE "public"."settlements_status_enum"`);
  }
}
