import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1744589265213 implements MigrationInterface {
    name = 'AutoMigration1744589265213'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlements" DROP COLUMN "transaction_id"`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD "original_transaction_id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD "linked_transaction_id" uuid`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP COLUMN "due_date"`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD "due_date" date NOT NULL`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD CONSTRAINT "FK_b3a89038fa7d7acd1f8e0a4b709" FOREIGN KEY ("original_transaction_id") REFERENCES "transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD CONSTRAINT "FK_5f103d42b6d4de8a154c45db0ba" FOREIGN KEY ("linked_transaction_id") REFERENCES "transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlements" DROP CONSTRAINT "FK_5f103d42b6d4de8a154c45db0ba"`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP CONSTRAINT "FK_b3a89038fa7d7acd1f8e0a4b709"`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP COLUMN "due_date"`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD "due_date" TIMESTAMP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP COLUMN "linked_transaction_id"`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP COLUMN "original_transaction_id"`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD "transaction_id" character varying NOT NULL`);
    }

}
