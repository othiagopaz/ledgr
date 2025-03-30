import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1743311222418 implements MigrationInterface {
    name = 'AutoMigration1743311222418'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "expected_refund_amount"`);
        await queryRunner.query(`ALTER TABLE "events" ADD "expected_refund_amount" numeric(19,4)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "expected_refund_amount"`);
        await queryRunner.query(`ALTER TABLE "events" ADD "expected_refund_amount" integer`);
    }

}
