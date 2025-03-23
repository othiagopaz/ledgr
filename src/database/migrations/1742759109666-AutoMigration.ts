import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1742759109666 implements MigrationInterface {
    name = 'AutoMigration1742759109666'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "financial_entries" DROP COLUMN "is_shared"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "financial_entries" ADD "is_shared" boolean`);
    }

}
