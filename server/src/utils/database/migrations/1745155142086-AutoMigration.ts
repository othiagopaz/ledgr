import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1745155142086 implements MigrationInterface {
    name = 'AutoMigration1745155142086'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "transferences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "description" character varying NOT NULL, "amount" integer NOT NULL, "date" date NOT NULL, "notes" character varying, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "source_account_id" uuid NOT NULL, "destination_account_id" uuid NOT NULL, "source_event_id" uuid NOT NULL, "destination_event_id" uuid NOT NULL, CONSTRAINT "PK_6f24c4f3799e6c0641916df19d2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "transferences" ADD CONSTRAINT "FK_c02a096e4be4ad8a2eab8cec152" FOREIGN KEY ("source_account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transferences" ADD CONSTRAINT "FK_e6c2b1709f6c2cab24474b5b9d2" FOREIGN KEY ("destination_account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transferences" ADD CONSTRAINT "FK_fe47a2a77356434c3e27ecd220d" FOREIGN KEY ("source_event_id") REFERENCES "events"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "transferences" ADD CONSTRAINT "FK_3478109fe16816b1b9edfcc3479" FOREIGN KEY ("destination_event_id") REFERENCES "events"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transferences" DROP CONSTRAINT "FK_3478109fe16816b1b9edfcc3479"`);
        await queryRunner.query(`ALTER TABLE "transferences" DROP CONSTRAINT "FK_fe47a2a77356434c3e27ecd220d"`);
        await queryRunner.query(`ALTER TABLE "transferences" DROP CONSTRAINT "FK_e6c2b1709f6c2cab24474b5b9d2"`);
        await queryRunner.query(`ALTER TABLE "transferences" DROP CONSTRAINT "FK_c02a096e4be4ad8a2eab8cec152"`);
        await queryRunner.query(`DROP TABLE "transferences"`);
    }

}
