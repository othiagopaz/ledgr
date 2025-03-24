import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1742755821918 implements MigrationInterface {
    name = 'AutoMigration1742755821918'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."installments_status_enum" AS ENUM('PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'SCHEDULED')`);
        await queryRunner.query(`CREATE TABLE "installments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "financial_entry_id" character varying NOT NULL, "amount" numeric NOT NULL, "due_date" TIMESTAMP NOT NULL, "competence_date" TIMESTAMP NOT NULL, "status" "public"."installments_status_enum" NOT NULL, "payment_date" TIMESTAMP, "account_id" character varying, "credit_card_id" character varying, "is_refundable" boolean, "is_shared" boolean, "notes" character varying, CONSTRAINT "PK_c74e44aa06bdebef2af0a93da1b" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "installments"`);
        await queryRunner.query(`DROP TYPE "public"."installments_status_enum"`);
    }

}
