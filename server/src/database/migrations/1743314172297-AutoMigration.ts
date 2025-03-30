import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1743314172297 implements MigrationInterface {
    name = 'AutoMigration1743314172297'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "categories" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "events" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "events" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "accounts" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "accounts" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "created_at"`);
    }

}
