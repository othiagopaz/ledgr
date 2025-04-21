import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1745253388386 implements MigrationInterface {
    name = 'AutoMigration1745253388386'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "category_relations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "parent_id" uuid NOT NULL, "child_id" uuid NOT NULL, CONSTRAINT "PK_a157af4a8dce9dacd94d35bf77b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "category_relations" ADD CONSTRAINT "FK_77db515cfe5d56d96764fc9d0d4" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "category_relations" ADD CONSTRAINT "FK_abffb84fc275a6803099120f55f" FOREIGN KEY ("child_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "category_relations" DROP CONSTRAINT "FK_abffb84fc275a6803099120f55f"`);
        await queryRunner.query(`ALTER TABLE "category_relations" DROP CONSTRAINT "FK_77db515cfe5d56d96764fc9d0d4"`);
        await queryRunner.query(`DROP TABLE "category_relations"`);
    }

}
