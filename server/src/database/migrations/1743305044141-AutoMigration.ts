import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutoMigration1743305044141 implements MigrationInterface {
  name = 'AutoMigration1743305044141';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL, "name" character varying NOT NULL, "type" "public"."categories_type_enum" NOT NULL, "color" character varying, "is_default" boolean NOT NULL DEFAULT false, "is_archived" boolean NOT NULL DEFAULT false, "user_id" character varying, "parent_category_id" uuid, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "accounts" ("id" uuid NOT NULL, "name" character varying NOT NULL, "type" "public"."accounts_type_enum" NOT NULL, "initial_balance" numeric(10,2) NOT NULL, "institution" character varying, "color" character varying, "is_archived" boolean NOT NULL DEFAULT false, "user_id" character varying, CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "event_id" uuid NOT NULL, "amount" numeric NOT NULL, "due_date" TIMESTAMP NOT NULL, "competence_date" TIMESTAMP NOT NULL, "status" "public"."transactions_status_enum" NOT NULL, "payment_date" TIMESTAMP, "account_id" character varying, "credit_card_id" character varying, "is_refundable" boolean, "is_shared" boolean, "notes" character varying, CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "description" character varying NOT NULL, "amount" numeric NOT NULL, "installments" integer NOT NULL, "competenceDate" TIMESTAMP NOT NULL, "type" "public"."events_type_enum" NOT NULL, "category_id" uuid NOT NULL, "credit_card_id" character varying, "account_id" uuid, "ownership_type" "public"."events_ownership_type_enum" NOT NULL, "expected_refund_amount" integer, "refund_installments" integer, "refund_installment_dates" jsonb, "is_off_balance" boolean NOT NULL, CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "FK_de08738901be6b34d2824a1e243" FOREIGN KEY ("parent_category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_4668f10567279f094acb4d17437" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD CONSTRAINT "FK_643188b30e049632f80367be4e1" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD CONSTRAINT "FK_54ec284da4b957748352c8310c8" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP CONSTRAINT "FK_54ec284da4b957748352c8310c8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" DROP CONSTRAINT "FK_643188b30e049632f80367be4e1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_4668f10567279f094acb4d17437"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_de08738901be6b34d2824a1e243"`,
    );
    await queryRunner.query(`DROP TABLE "events"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
