import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1743310952171 implements MigrationInterface {
    name = 'AutoMigration1743310952171'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "amount" TYPE numeric(19,4)`);
        await queryRunner.query(`ALTER TABLE "events" ALTER COLUMN "amount" TYPE numeric(19,4)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "events" ALTER COLUMN "amount" TYPE numeric`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "amount" TYPE numeric`);
    }

}
