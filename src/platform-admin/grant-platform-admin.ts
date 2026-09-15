import 'dotenv/config';
import { DataSource } from 'typeorm';

// Deliberately not reusing ../database/data-source: that config's
// migrations glob targets the .ts sources for the typeorm-ts-node-commonjs
// CLI wrapper. DataSource.initialize() tries to load whatever migrations
// are configured even though this script never touches them, which breaks
// under plain `node dist/...` execution. This script only runs raw SQL, so
// it gets its own minimal connection with no entities/migrations at all.
const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5435),
  username: process.env.DB_USER ?? 'accounting',
  password: process.env.DB_PASSWORD ?? 'accounting_dev',
  database: process.env.DB_NAME ?? 'accounting_nest',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
  schema: 'public',
});

async function main() {
  const email = process.argv[2]?.trim();
  if (!email) {
    throw new Error('Usage: npm run platform-admin:grant -- adresse@email.tn');
  }

  await dataSource.initialize();
  try {
    const normalizedEmail = email.toUpperCase();
    const user = await dataSource.transaction(async (manager) => {
      const users = await manager.query<
        Array<{ id: string; email: string; fullName: string }>
      >(
        `
          SELECT "id", "email", "full_name" AS "fullName"
          FROM "accounting"."users"
          WHERE "normalized_email" = $1
          FOR UPDATE
        `,
        [normalizedEmail],
      );
      const selectedUser = users[0];
      if (!selectedUser) {
        throw new Error(`Aucun compte trouvé pour ${email}.`);
      }

      await manager.query(
        `
          UPDATE "accounting"."users"
          SET "is_platform_admin" = true, "updated_at_utc" = now()
          WHERE "id" = $1::uuid
        `,
        [selectedUser.id],
      );
      await manager.query(
        `
        INSERT INTO "accounting"."audit_logs"
          ("organization_id", "actor_user_id", "action", "entity_type", "entity_id", "details_json")
        VALUES (
          NULL,
          $1::uuid,
          'platform_admin.granted',
          'User',
          $1::text,
          $2::jsonb
        )
        `,
        [
          selectedUser.id,
          JSON.stringify({
            email: selectedUser.email,
            source: 'owner-cli',
          }),
        ],
      );
      return selectedUser;
    });
    console.log(
      `${user.fullName} (${user.email}) est maintenant administrateur de la plateforme Fiscora.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
