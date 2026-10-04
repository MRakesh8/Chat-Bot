import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });
  console.log("[*] Creating project_local_sessions table and applying RLS policies...");

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "project_local_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "local_url" varchar(2048) NOT NULL,
        "development_url" varchar(2048),
        "status" varchar(50) DEFAULT 'READY' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "expires_at" timestamp,
        "revoked_at" timestamp,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS "project_local_sessions_project_id_idx" ON "project_local_sessions" ("project_id");
      CREATE INDEX IF NOT EXISTS "project_local_sessions_org_id_idx" ON "project_local_sessions" ("organization_id");
      CREATE INDEX IF NOT EXISTS "project_local_sessions_user_id_idx" ON "project_local_sessions" ("user_id");

      ALTER TABLE "project_local_sessions" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "project_local_sessions" FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS tenant_isolation_policy ON "project_local_sessions";

      CREATE POLICY tenant_isolation_policy ON "project_local_sessions"
        FOR ALL USING (
          current_setting('app.bypass_rls', true) = 'true' OR
          organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        );
    `);
    console.log("[+] project_local_sessions table created and RLS policy applied successfully.");
  } catch (err) {
    console.error("[-] Failed to create project_local_sessions table:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
