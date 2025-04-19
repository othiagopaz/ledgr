import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1745068756302 implements MigrationInterface {
    name = 'AutoMigration1745068756302'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "credit_cards" RENAME COLUMN "closing_day" TO "estimated_days_before_due"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "credit_cards" RENAME COLUMN "estimated_days_before_due" TO "closing_day"`);
    }

}
