import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1742756350680 implements MigrationInterface {
    name = 'AutoMigration1742756350680'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "installments" DROP COLUMN "financial_entry_id"`);
        await queryRunner.query(`ALTER TABLE "installments" ADD "financial_entry_id" uuid NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "installments" DROP COLUMN "financial_entry_id"`);
        await queryRunner.query(`ALTER TABLE "installments" ADD "financial_entry_id" character varying NOT NULL`);
    }

}
