import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1742759050094 implements MigrationInterface {
    name = 'AutoMigration1742759050094'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "financial_entries" ADD "is_shared" boolean`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "financial_entries" DROP COLUMN "is_shared"`);
    }

}
