import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1745006334231 implements MigrationInterface {
    name = 'AutoMigration1745006334231'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "credit_cards" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "closing_day" integer NOT NULL, "due_day" integer NOT NULL, "flag" character varying NOT NULL, "is_archived" boolean NOT NULL, "limit" integer, "institution" character varying, "user_id" character varying, CONSTRAINT "PK_7749b596e358703bb3dd8b45b7c" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "credit_cards"`);
    }

}
