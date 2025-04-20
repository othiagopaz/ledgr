import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1745156819120 implements MigrationInterface {
    name = 'AutoMigration1745156819120'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "events" ALTER COLUMN "negotiator_id" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "events" ALTER COLUMN "negotiator_id" SET NOT NULL`);
    }

}
