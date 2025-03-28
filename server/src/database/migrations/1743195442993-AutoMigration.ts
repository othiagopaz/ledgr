import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1743195442993 implements MigrationInterface {
    name = 'AutoMigration1743195442993'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."events_type_enum" AS ENUM('INCOME', 'EXPENSE')`);
        await queryRunner.query(`CREATE TYPE "public"."events_ownership_type_enum" AS ENUM('OWN', 'SHARED', 'REFUNDABLE')`);
        await queryRunner.query(`CREATE TABLE "events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "description" character varying NOT NULL, "amount" numeric NOT NULL, "installments" integer NOT NULL, "date" TIMESTAMP NOT NULL, "type" "public"."events_type_enum" NOT NULL, "category_id" uuid NOT NULL, "credit_card_id" character varying, "account_id" uuid, "ownership_type" "public"."events_ownership_type_enum", "expected_refund_amount" integer, "refund_installments" integer, "refund_installment_dates" jsonb, "is_off_balance" boolean, CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_status_enum" AS ENUM('PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'SCHEDULED')`);
        await queryRunner.query(`CREATE TABLE "transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "event_id" uuid NOT NULL, "amount" numeric NOT NULL, "due_date" TIMESTAMP NOT NULL, "competence_date" TIMESTAMP NOT NULL, "status" "public"."transactions_status_enum" NOT NULL, "payment_date" TIMESTAMP, "account_id" character varying, "credit_card_id" character varying, "is_refundable" boolean, "is_shared" boolean, "notes" character varying, CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "events" ADD CONSTRAINT "FK_643188b30e049632f80367be4e1" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "events" ADD CONSTRAINT "FK_54ec284da4b957748352c8310c8" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "events" DROP CONSTRAINT "FK_54ec284da4b957748352c8310c8"`);
        await queryRunner.query(`ALTER TABLE "events" DROP CONSTRAINT "FK_643188b30e049632f80367be4e1"`);
        await queryRunner.query(`DROP TABLE "transactions"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_status_enum"`);
        await queryRunner.query(`DROP TABLE "events"`);
        await queryRunner.query(`DROP TYPE "public"."events_ownership_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."events_type_enum"`);
    }

}
