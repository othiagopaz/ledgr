import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1745022046628 implements MigrationInterface {
    name = 'AutoMigration1745022046628'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "closing_date"`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "closing_date" date NOT NULL`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "due_date"`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "due_date" date NOT NULL`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "status"`);
        await queryRunner.query(`CREATE TYPE "public"."invoices_status_enum" AS ENUM('OPEN', 'CLOSED', 'OVERDUE', 'CANCELLED', 'PAID')`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "status" "public"."invoices_status_enum" NOT NULL`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "payment_date"`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "payment_date" date`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "payment_date"`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "payment_date" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."invoices_status_enum"`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "status" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "due_date"`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "due_date" TIMESTAMP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "closing_date"`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "closing_date" TIMESTAMP NOT NULL`);
    }

}
