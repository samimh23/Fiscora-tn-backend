import { MigrationInterface, QueryRunner } from 'typeorm';
import { permissionSeed } from '../permissions';

export class GeneratedInitial1784191623982 implements MigrationInterface {
  name = 'GeneratedInitial1784191623982';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "accounting"`);
    await queryRunner.query(
      `CREATE TABLE "accounting"."users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(), "email" character varying(320) NOT NULL, "normalized_email" character varying(320) NOT NULL, "password_hash" character varying(1000) NOT NULL, "full_name" character varying(160) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "email_verified" boolean NOT NULL DEFAULT false, "last_login_at_utc" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_004558cea14a9f05ae8284bdb8" ON "accounting"."users" ("normalized_email") `,
    );
    await queryRunner.query(
      `CREATE TABLE "accounting"."organizations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(), "name" character varying(200) NOT NULL, "slug" character varying(120) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_963693341bd612aa01ddf3a4b6" ON "accounting"."organizations" ("slug") `,
    );
    await queryRunner.query(
      `CREATE TABLE "accounting"."roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(), "organization_id" uuid NOT NULL, "name" character varying(100) NOT NULL, "normalized_name" character varying(100) NOT NULL, "is_system" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_7af837d5f74e242eb8db84c890e" UNIQUE ("organization_id", "normalized_name"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "accounting"."permissions" ("name" character varying(100) NOT NULL, "description" character varying(250) NOT NULL, CONSTRAINT "PK_48ce552495d14eae9b187bb6716" PRIMARY KEY ("name"))`,
    );
    for (const [name, description] of permissionSeed) {
      await queryRunner.query(
        `INSERT INTO "accounting"."permissions" ("name", "description") VALUES ($1, $2)`,
        [name, description],
      );
    }
    await queryRunner.query(
      `CREATE TABLE "accounting"."role_permissions" ("role_id" uuid NOT NULL, "permission_name" character varying(100) NOT NULL, CONSTRAINT "PK_fff9a58018e6a23894e721e09e2" PRIMARY KEY ("role_id", "permission_name"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "accounting"."organization_memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(), "organization_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role_id" uuid NOT NULL, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_caa73db1b161fa6b3a042290fe7" UNIQUE ("organization_id", "user_id"), CONSTRAINT "PK_cd7be805730a4c778a5f45364af" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "accounting"."refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(), "user_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at_utc" TIMESTAMP WITH TIME ZONE, "replaced_by_token_id" uuid, CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a7838d2ba25be1342091b6695f" ON "accounting"."refresh_tokens" ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "accounting"."organization_invitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(), "organization_id" uuid NOT NULL, "role_id" uuid NOT NULL, "email" character varying(320) NOT NULL, "normalized_email" character varying(320) NOT NULL, "token_hash" character varying(64) NOT NULL, "invited_by_user_id" uuid NOT NULL, "expires_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL, "accepted_at_utc" TIMESTAMP WITH TIME ZONE, "revoked_at_utc" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_f172f12b8a9ee6584b661f57e24" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_da2dfab0d3cb7f1bfdc886c428" ON "accounting"."organization_invitations" ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_13f6c387d41bcfdd5c53862835" ON "accounting"."organization_invitations" ("organization_id", "normalized_email") `,
    );
    await queryRunner.query(
      `CREATE TABLE "accounting"."audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(), "organization_id" uuid, "actor_user_id" uuid, "action" character varying(120) NOT NULL, "entity_type" character varying(120) NOT NULL, "entity_id" character varying(100) NOT NULL, "details_json" jsonb, CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f8141fd08db95ce534a0b67b59" ON "accounting"."audit_logs" ("organization_id", "created_at_utc") `,
    );
    await queryRunner.query(
      `CREATE TABLE "accounting"."company_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(), "organization_id" uuid NOT NULL, "legal_name" character varying(200) NOT NULL, "trading_name" character varying(200), "tax_identifier" character varying(100), "registration_number" character varying(100), "country_code" character varying(2) NOT NULL, "base_currency_code" character varying(3) NOT NULL, "address_line_1" character varying(250), "address_line_2" character varying(250), "city" character varying(120), "postal_code" character varying(30), "phone" character varying(50), "email" character varying(320), CONSTRAINT "REL_1eace7c80b9d5d4c152d364248" UNIQUE ("organization_id"), CONSTRAINT "PK_1980200b310bd1e2ac86aa1ae4a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1eace7c80b9d5d4c152d364248" ON "accounting"."company_profiles" ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "accounting"."fiscal_years" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(), "organization_id" uuid NOT NULL, "name" character varying(100) NOT NULL, "starts_on" date NOT NULL, "ends_on" date NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'Open', "closed_at_utc" TIMESTAMP WITH TIME ZONE, "closed_by_user_id" uuid, CONSTRAINT "UQ_43e0620bf006a19202864832263" UNIQUE ("organization_id", "name"), CONSTRAINT "PK_0470d6bc5c757d488b7b04e1899" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_47b9afd8a30b047767c121d689" ON "accounting"."fiscal_years" ("organization_id", "starts_on", "ends_on") `,
    );
    await queryRunner.query(
      `CREATE TABLE "accounting"."ledger_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at_utc" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at_utc" TIMESTAMP WITH TIME ZONE DEFAULT now(), "organization_id" uuid NOT NULL, "code" character varying(30) NOT NULL, "normalized_code" character varying(30) NOT NULL, "name" character varying(200) NOT NULL, "description" character varying(1000), "type" character varying(30) NOT NULL, "normal_balance" character varying(10) NOT NULL, "parent_account_id" uuid, "allows_posting" boolean NOT NULL DEFAULT true, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_17ccacb2b61064f7c17704c6fb8" UNIQUE ("organization_id", "normalized_code"), CONSTRAINT "PK_62b34396dda564757cf123fff0e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."roles" ADD CONSTRAINT "FK_c328a1ecd12a5f153a96df4509e" FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."role_permissions" ADD CONSTRAINT "FK_178199805b901ccd220ab7740ec" FOREIGN KEY ("role_id") REFERENCES "accounting"."roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."role_permissions" ADD CONSTRAINT "FK_127b8ca4f6dac693657f5bb602c" FOREIGN KEY ("permission_name") REFERENCES "accounting"."permissions"("name") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."organization_memberships" ADD CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49" FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."organization_memberships" ADD CONSTRAINT "FK_5352fc550034d507d6c76dd2901" FOREIGN KEY ("user_id") REFERENCES "accounting"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."organization_memberships" ADD CONSTRAINT "FK_153ee52445389b67ad7d6132478" FOREIGN KEY ("role_id") REFERENCES "accounting"."roles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "accounting"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."organization_invitations" ADD CONSTRAINT "FK_7f88954e8d667a76ae3ced6f446" FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."organization_invitations" ADD CONSTRAINT "FK_2d204b6ac5f1fd0473ad27c10b3" FOREIGN KEY ("role_id") REFERENCES "accounting"."roles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."company_profiles" ADD CONSTRAINT "FK_1eace7c80b9d5d4c152d3642481" FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."fiscal_years" ADD CONSTRAINT "FK_dc2f05776164673c7e54e10d676" FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."ledger_accounts" ADD CONSTRAINT "FK_df965997f6ac70931ceedd76b36" FOREIGN KEY ("organization_id") REFERENCES "accounting"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."ledger_accounts" ADD CONSTRAINT "FK_c1c583c8d2aeae33192fc1c773e" FOREIGN KEY ("parent_account_id") REFERENCES "accounting"."ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounting"."ledger_accounts" DROP CONSTRAINT "FK_c1c583c8d2aeae33192fc1c773e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."ledger_accounts" DROP CONSTRAINT "FK_df965997f6ac70931ceedd76b36"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."fiscal_years" DROP CONSTRAINT "FK_dc2f05776164673c7e54e10d676"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."company_profiles" DROP CONSTRAINT "FK_1eace7c80b9d5d4c152d3642481"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."organization_invitations" DROP CONSTRAINT "FK_2d204b6ac5f1fd0473ad27c10b3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."organization_invitations" DROP CONSTRAINT "FK_7f88954e8d667a76ae3ced6f446"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."organization_memberships" DROP CONSTRAINT "FK_153ee52445389b67ad7d6132478"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."organization_memberships" DROP CONSTRAINT "FK_5352fc550034d507d6c76dd2901"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."organization_memberships" DROP CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."role_permissions" DROP CONSTRAINT "FK_127b8ca4f6dac693657f5bb602c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."role_permissions" DROP CONSTRAINT "FK_178199805b901ccd220ab7740ec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounting"."roles" DROP CONSTRAINT "FK_c328a1ecd12a5f153a96df4509e"`,
    );
    await queryRunner.query(`DROP TABLE "accounting"."ledger_accounts"`);
    await queryRunner.query(
      `DROP INDEX "accounting"."IDX_47b9afd8a30b047767c121d689"`,
    );
    await queryRunner.query(`DROP TABLE "accounting"."fiscal_years"`);
    await queryRunner.query(
      `DROP INDEX "accounting"."IDX_1eace7c80b9d5d4c152d364248"`,
    );
    await queryRunner.query(`DROP TABLE "accounting"."company_profiles"`);
    await queryRunner.query(
      `DROP INDEX "accounting"."IDX_f8141fd08db95ce534a0b67b59"`,
    );
    await queryRunner.query(`DROP TABLE "accounting"."audit_logs"`);
    await queryRunner.query(
      `DROP INDEX "accounting"."IDX_13f6c387d41bcfdd5c53862835"`,
    );
    await queryRunner.query(
      `DROP INDEX "accounting"."IDX_da2dfab0d3cb7f1bfdc886c428"`,
    );
    await queryRunner.query(
      `DROP TABLE "accounting"."organization_invitations"`,
    );
    await queryRunner.query(
      `DROP INDEX "accounting"."IDX_a7838d2ba25be1342091b6695f"`,
    );
    await queryRunner.query(`DROP TABLE "accounting"."refresh_tokens"`);
    await queryRunner.query(
      `DROP TABLE "accounting"."organization_memberships"`,
    );
    await queryRunner.query(`DROP TABLE "accounting"."role_permissions"`);
    await queryRunner.query(`DROP TABLE "accounting"."permissions"`);
    await queryRunner.query(`DROP TABLE "accounting"."roles"`);
    await queryRunner.query(
      `DROP INDEX "accounting"."IDX_963693341bd612aa01ddf3a4b6"`,
    );
    await queryRunner.query(`DROP TABLE "accounting"."organizations"`);
    await queryRunner.query(
      `DROP INDEX "accounting"."IDX_004558cea14a9f05ae8284bdb8"`,
    );
    await queryRunner.query(`DROP TABLE "accounting"."users"`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS "accounting"`);
  }
}
