import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1744641829590 implements MigrationInterface {
    name = 'AutoMigration1744641829590'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlements" DROP COLUMN "payment_date"`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD "payment_date" date`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlements" DROP COLUMN "payment_date"`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD "payment_date" TIMESTAMP`);
    }

}
