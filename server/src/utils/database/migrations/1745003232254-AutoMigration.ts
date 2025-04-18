import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1745003232254 implements MigrationInterface {
    name = 'AutoMigration1745003232254'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "accounts" ADD "is_default" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "is_default"`);
    }

}
