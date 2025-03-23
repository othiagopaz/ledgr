import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1742768266669 implements MigrationInterface {
    name = 'AutoMigration1742768266669'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."accounts_type_enum" AS ENUM('CHECKING', 'SAVINGS', 'WALLET', 'INVESTMENT', 'OTHER')`);
        await queryRunner.query(`CREATE TABLE "accounts" ("id" uuid NOT NULL, "name" character varying NOT NULL, "type" "public"."accounts_type_enum" NOT NULL, "initial_balance" numeric(10,2) NOT NULL, "institution" character varying, "color" character varying, "is_archived" boolean NOT NULL DEFAULT false, "user_id" character varying, CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "financial_entries" DROP COLUMN "account_id"`);
        await queryRunner.query(`ALTER TABLE "financial_entries" ADD "account_id" uuid`);
        await queryRunner.query(`ALTER TABLE "financial_entries" ADD CONSTRAINT "FK_9765e11b51842e98b39af617195" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "financial_entries" DROP CONSTRAINT "FK_9765e11b51842e98b39af617195"`);
        await queryRunner.query(`ALTER TABLE "financial_entries" DROP COLUMN "account_id"`);
        await queryRunner.query(`ALTER TABLE "financial_entries" ADD "account_id" character varying`);
        await queryRunner.query(`DROP TABLE "accounts"`);
        await queryRunner.query(`DROP TYPE "public"."accounts_type_enum"`);
    }

}
