import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1745021671534 implements MigrationInterface {
    name = 'AutoMigration1745021671534'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlements" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "credit_cards" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "credit_cards" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "credit_cards" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "credit_cards" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP COLUMN "updated_at"`);
    }

}
