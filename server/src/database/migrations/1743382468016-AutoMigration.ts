import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1743382468016 implements MigrationInterface {
    name = 'AutoMigration1743382468016'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "amount"`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "amount" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "amount"`);
        await queryRunner.query(`ALTER TABLE "events" ADD "amount" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "expected_refund_amount"`);
        await queryRunner.query(`ALTER TABLE "events" ADD "expected_refund_amount" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "expected_refund_amount"`);
        await queryRunner.query(`ALTER TABLE "events" ADD "expected_refund_amount" numeric(19,4)`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "amount"`);
        await queryRunner.query(`ALTER TABLE "events" ADD "amount" numeric(19,4) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "amount"`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "amount" numeric(19,4) NOT NULL`);
    }

}
