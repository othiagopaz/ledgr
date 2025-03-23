import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1742740921926 implements MigrationInterface {
    name = 'AutoMigration1742740921926'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."financial_entries_type_enum" AS ENUM('INCOME', 'EXPENSE')`);
        await queryRunner.query(`CREATE TYPE "public"."financial_entries_ownership_type_enum" AS ENUM('OWN', 'SHARED', 'REFUNDABLE')`);
        await queryRunner.query(`CREATE TABLE "financial_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "description" character varying NOT NULL, "amount" numeric NOT NULL, "installments" integer NOT NULL, "date" TIMESTAMP NOT NULL, "type" "public"."financial_entries_type_enum" NOT NULL, "category_id" character varying NOT NULL, "credit_card_id" character varying, "account_id" character varying, "ownership_type" "public"."financial_entries_ownership_type_enum", "expected_refund_amount" integer, "refund_installments" integer, "refund_installment_dates" jsonb, "is_off_balance" boolean, CONSTRAINT "PK_61883ae069a9a2c228e3ecb0b6d" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "financial_entries"`);
        await queryRunner.query(`DROP TYPE "public"."financial_entries_ownership_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."financial_entries_type_enum"`);
    }

}
