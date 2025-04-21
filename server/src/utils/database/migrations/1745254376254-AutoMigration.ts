import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1745254376254 implements MigrationInterface {
    name = 'AutoMigration1745254376254'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "category_relations" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "category_relations" DROP COLUMN "updated_at"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "category_relations" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "category_relations" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
    }

}
