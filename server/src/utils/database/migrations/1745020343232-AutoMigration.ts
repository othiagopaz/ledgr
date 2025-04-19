import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1745020343232 implements MigrationInterface {
    name = 'AutoMigration1745020343232'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "credit_card_id"`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "credit_card_id" uuid`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_f0da938718eb2a8b26e2fcb4cbe" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_f0da938718eb2a8b26e2fcb4cbe"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "credit_card_id"`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "credit_card_id" character varying`);
    }

}
