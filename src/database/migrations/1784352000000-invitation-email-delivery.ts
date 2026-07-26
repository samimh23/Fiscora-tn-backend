import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvitationEmailDelivery1784352000000 implements MigrationInterface {
  name = 'InvitationEmailDelivery1784352000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accounting"."organization_invitations"
        ADD COLUMN "delivery_status" varchar(20) NOT NULL DEFAULT 'EN_ATTENTE',
        ADD COLUMN "delivery_attempts" integer NOT NULL DEFAULT 0,
        ADD COLUMN "sent_at_utc" timestamptz,
        ADD COLUMN "delivery_error" text,
        ADD CONSTRAINT "CHK_invitation_delivery_status"
          CHECK ("delivery_status" IN ('EN_ATTENTE','ENVOYEE','ECHEC'));
      CREATE INDEX "IDX_organization_invitations_status"
        ON "accounting"."organization_invitations"
        ("organization_id","accepted_at_utc","revoked_at_utc","expires_at_utc");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "accounting"."IDX_organization_invitations_status";
      ALTER TABLE "accounting"."organization_invitations"
        DROP CONSTRAINT IF EXISTS "CHK_invitation_delivery_status",
        DROP COLUMN IF EXISTS "delivery_error",
        DROP COLUMN IF EXISTS "sent_at_utc",
        DROP COLUMN IF EXISTS "delivery_attempts",
        DROP COLUMN IF EXISTS "delivery_status";
    `);
  }
}
