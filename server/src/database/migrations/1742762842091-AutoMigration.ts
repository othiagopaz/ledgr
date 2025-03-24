import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1742762842091 implements MigrationInterface {
    name = 'AutoMigration1742762842091'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "financial_entries" DROP COLUMN "category_id"`);
        await queryRunner.query(`ALTER TABLE "financial_entries" ADD "category_id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "financial_entries" ADD CONSTRAINT "FK_7b51e12217e6164e6481f247464" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "financial_entries" DROP CONSTRAINT "FK_7b51e12217e6164e6481f247464"`);
        await queryRunner.query(`ALTER TABLE "financial_entries" DROP COLUMN "category_id"`);
        await queryRunner.query(`ALTER TABLE "financial_entries" ADD "category_id" character varying NOT NULL`);
    }

}
