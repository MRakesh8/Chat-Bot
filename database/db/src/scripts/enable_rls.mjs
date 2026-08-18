import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });
  console.log("[*] Connected. Enabling RLS and setting up tenant policies with bypass switch...");

  try {
    await pool.query(`
      BEGIN;

      -- Enable RLS on all tenant tables
      ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "organization_usage" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "knowledge_gaps" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "user_api_keys" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "api_logs" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "connected_services" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "whatsapp_connections" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;

      -- Force RLS even for owner role
      ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;
      ALTER TABLE "organization_members" FORCE ROW LEVEL SECURITY;
      ALTER TABLE "organization_usage" FORCE ROW LEVEL SECURITY;
      ALTER TABLE "usage_events" FORCE ROW LEVEL SECURITY;
      ALTER TABLE "knowledge_gaps" FORCE ROW LEVEL SECURITY;
      ALTER TABLE "user_api_keys" FORCE ROW LEVEL SECURITY;
      ALTER TABLE "api_logs" FORCE ROW LEVEL SECURITY;
      ALTER TABLE "connected_services" FORCE ROW LEVEL SECURITY;
      ALTER TABLE "whatsapp_connections" FORCE ROW LEVEL SECURITY;
      ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;

      -- Drop existing policies
      DROP POLICY IF EXISTS tenant_isolation_policy ON "projects";
      DROP POLICY IF EXISTS tenant_isolation_policy ON "organization_members";
      DROP POLICY IF EXISTS tenant_isolation_policy ON "organization_usage";
      DROP POLICY IF EXISTS tenant_isolation_policy ON "usage_events";
      DROP POLICY IF EXISTS tenant_isolation_policy ON "knowledge_gaps";
      DROP POLICY IF EXISTS tenant_isolation_policy ON "user_api_keys";
      DROP POLICY IF EXISTS tenant_isolation_policy ON "api_logs";
      DROP POLICY IF EXISTS tenant_isolation_policy ON "connected_services";
      DROP POLICY IF EXISTS tenant_isolation_policy ON "whatsapp_connections";
      DROP POLICY IF EXISTS tenant_isolation_policy ON "payments";

      -- Create new policies checking app.current_organization_id context variable or app.bypass_rls
      CREATE POLICY tenant_isolation_policy ON "projects"
        FOR ALL USING (
          current_setting('app.bypass_rls', true) = 'true' OR
          organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        );

      CREATE POLICY tenant_isolation_policy ON "organization_members"
        FOR ALL USING (
          current_setting('app.bypass_rls', true) = 'true' OR
          organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        );

      CREATE POLICY tenant_isolation_policy ON "organization_usage"
        FOR ALL USING (
          current_setting('app.bypass_rls', true) = 'true' OR
          organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        );

      CREATE POLICY tenant_isolation_policy ON "usage_events"
        FOR ALL USING (
          current_setting('app.bypass_rls', true) = 'true' OR
          organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        );

      CREATE POLICY tenant_isolation_policy ON "knowledge_gaps"
        FOR ALL USING (
          current_setting('app.bypass_rls', true) = 'true' OR
          project_id IN (
            SELECT id FROM "projects" WHERE organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
          )
        );

      CREATE POLICY tenant_isolation_policy ON "user_api_keys"
        FOR ALL USING (
          current_setting('app.bypass_rls', true) = 'true' OR
          organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        );

      CREATE POLICY tenant_isolation_policy ON "api_logs"
        FOR ALL USING (
          current_setting('app.bypass_rls', true) = 'true' OR
          organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        );

      CREATE POLICY tenant_isolation_policy ON "connected_services"
        FOR ALL USING (
          current_setting('app.bypass_rls', true) = 'true' OR
          organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        );

      CREATE POLICY tenant_isolation_policy ON "whatsapp_connections"
        FOR ALL USING (
          current_setting('app.bypass_rls', true) = 'true' OR
          organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        );

      CREATE POLICY tenant_isolation_policy ON "payments"
        FOR ALL USING (
          current_setting('app.bypass_rls', true) = 'true' OR
          organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        );

      COMMIT;
    `);
    console.log("[+] RLS and tenant security policies successfully enabled.");
  } catch (err) {
    console.error("[-] Failed to apply RLS policies:", err);
    await pool.query("ROLLBACK;").catch(() => {});
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
