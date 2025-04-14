import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1744634020989 implements MigrationInterface {
    name = 'AutoMigration1744634020989'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlements" DROP CONSTRAINT "FK_b3a89038fa7d7acd1f8e0a4b709"`);
        await queryRunner.query(`ALTER TABLE "settlements" ALTER COLUMN "original_transaction_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "accounts" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "account_id"`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "account_id" uuid`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD CONSTRAINT "FK_b3a89038fa7d7acd1f8e0a4b709" FOREIGN KEY ("original_transaction_id") REFERENCES "transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_49c0d6e8ba4bfb5582000d851f0" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_49c0d6e8ba4bfb5582000d851f0"`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP CONSTRAINT "FK_b3a89038fa7d7acd1f8e0a4b709"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "account_id"`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "account_id" character varying`);
        await queryRunner.query(`ALTER TABLE "accounts" ALTER COLUMN "id" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "settlements" ALTER COLUMN "original_transaction_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD CONSTRAINT "FK_b3a89038fa7d7acd1f8e0a4b709" FOREIGN KEY ("original_transaction_id") REFERENCES "transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
