import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1745011217221 implements MigrationInterface {
    name = 'AutoMigration1745011217221'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "invoices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference_month" integer NOT NULL, "reference_year" integer NOT NULL, "closing_date" TIMESTAMP NOT NULL, "due_date" TIMESTAMP NOT NULL, "status" character varying NOT NULL, "payment_date" TIMESTAMP, "account_id" character varying, "credit_card_id" uuid NOT NULL, CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "invoice_id" uuid`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD CONSTRAINT "FK_b19090a8ecf0774a50a2887f6ce" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_3a12e9b258f9cd052e43cacf75b" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_3a12e9b258f9cd052e43cacf75b"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_b19090a8ecf0774a50a2887f6ce"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "invoice_id"`);
        await queryRunner.query(`DROP TABLE "invoices"`);
    }

}
