import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set in env");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });
  console.log("[*] Database connection successful. Starting migration checks...");

  try {
    // 1. Pre-migration count verification
    const preUsersCount = (await pool.query("SELECT COUNT(*) FROM users;")).rows[0].count;
    const preProjectsCount = (await pool.query("SELECT COUNT(*) FROM projects;")).rows[0].count;
    const prePaymentsCount = (await pool.query("SELECT COUNT(*) FROM payments;")).rows[0].count;
    const preUserKeysCount = (await pool.query("SELECT COUNT(*) FROM user_api_keys;")).rows[0].count;
    const preWAConnectionsCount = (await pool.query("SELECT COUNT(*) FROM whatsapp_connections;")).rows[0].count;
    const preConnectedServicesCount = (await pool.query("SELECT COUNT(*) FROM connected_services;")).rows[0].count;

    console.log("\n[+] Pre-Migration Metrics:");
    console.log(`    - Users: ${preUsersCount}`);
    console.log(`    - Projects: ${preProjectsCount}`);
    console.log(`    - Payments: ${prePaymentsCount}`);
    console.log(`    - User API Keys: ${preUserKeysCount}`);
    console.log(`    - WhatsApp Connections: ${preWAConnectionsCount}`);
    console.log(`    - Connected Services: ${preConnectedServicesCount}\n`);

    // 2. DDL Schema Migrations (Run inside transaction)
    console.log("[*] Applying schema updates...");
    
    await pool.query(`
      BEGIN;

      -- Create plans table if not exists (drizzle should have created it, but verify)
      CREATE TABLE IF NOT EXISTS "plans" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(100) NOT NULL,
        "price" integer NOT NULL,
        "currency" varchar(10) DEFAULT 'INR' NOT NULL,
        "interval" varchar(50) DEFAULT 'lifetime' NOT NULL,
        "features" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );

      -- Add default Free plan if not exists
      INSERT INTO "plans" (id, name, price, currency, interval, features)
      VALUES ('00000000-0000-0000-0000-000000000001', 'Free', 0, 'INR', 'lifetime', '{"maxProjects": 1}')
      ON CONFLICT DO NOTHING;

      -- Create organizations table
      CREATE TABLE IF NOT EXISTS "organizations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(255) NOT NULL,
        "plan_id" uuid REFERENCES "plans"("id") ON DELETE SET NULL,
        "stripe_customer_id" varchar(255),
        "razorpay_customer_id" varchar(255),
        "subscription_id" varchar(255),
        "subscription_status" varchar(50) DEFAULT 'inactive' NOT NULL,
        "trial_started_at" timestamp,
        "trial_ended_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );

      -- Create organization_members table
      CREATE TABLE IF NOT EXISTS "organization_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role" varchar(50) DEFAULT 'viewer' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "org_user_uniq_idx" ON "organization_members"("organization_id", "user_id");
      CREATE INDEX IF NOT EXISTS "org_members_org_id_idx" ON "organization_members"("organization_id");
      CREATE INDEX IF NOT EXISTS "org_members_user_id_idx" ON "organization_members"("user_id");

      -- Create organization_usage table
      CREATE TABLE IF NOT EXISTS "organization_usage" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "billing_cycle_start" timestamp NOT NULL,
        "billing_cycle_end" timestamp NOT NULL,
        "messages_sent" integer DEFAULT 0 NOT NULL,
        "storage_bytes" integer DEFAULT 0 NOT NULL,
        "crawl_count" integer DEFAULT 0 NOT NULL,
        "action_count" integer DEFAULT 0 NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "org_cycle_uniq_idx" ON "organization_usage"("organization_id", "billing_cycle_start");
      CREATE INDEX IF NOT EXISTS "org_usage_org_id_idx" ON "organization_usage"("organization_id");

      -- Create usage_events table
      CREATE TABLE IF NOT EXISTS "usage_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
        "event_type" varchar(50) NOT NULL,
        "quantity" integer DEFAULT 1 NOT NULL,
        "provider" varchar(50),
        "model" varchar(255),
        "input_tokens" integer DEFAULT 0 NOT NULL,
        "output_tokens" integer DEFAULT 0 NOT NULL,
        "estimated_cost" varchar(50) DEFAULT '0' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS "usage_events_org_id_idx" ON "usage_events"("organization_id");
      CREATE INDEX IF NOT EXISTS "usage_events_org_type_idx" ON "usage_events"("organization_id", "event_type");

      -- Create knowledge_gaps table
      CREATE TABLE IF NOT EXISTS "knowledge_gaps" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "question_text" text NOT NULL,
        "asked_count" integer DEFAULT 1 NOT NULL,
        "is_resolved" boolean DEFAULT false NOT NULL,
        "resolved_source_id" uuid REFERENCES "knowledge_sources"("id") ON DELETE SET NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );

      CREATE INDEX IF NOT EXISTS "knowledge_gaps_project_id_idx" ON "knowledge_gaps"("project_id");

      -- Add organization_id column to existing tables safely
      ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE;
      ALTER TABLE "user_api_keys" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE;
      ALTER TABLE "api_logs" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE;
      ALTER TABLE "connected_services" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE;
      ALTER TABLE "whatsapp_connections" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE;
      ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE;

      -- Add indexes
      CREATE INDEX IF NOT EXISTS "projects_organization_id_idx" ON "projects"("organization_id");
      CREATE INDEX IF NOT EXISTS "api_logs_org_id_idx" ON "api_logs"("organization_id");
      CREATE INDEX IF NOT EXISTS "whatsapp_connections_org_id_idx" ON "whatsapp_connections"("organization_id");
      CREATE INDEX IF NOT EXISTS "payments_org_id_idx" ON "payments"("organization_id");
      CREATE INDEX IF NOT EXISTS "messages_session_id_idx" ON "messages"("session_id");
      CREATE INDEX IF NOT EXISTS "payment_logs_payment_id_idx" ON "payment_logs"("payment_id");

      -- pgvector HNSW index
      CREATE INDEX IF NOT EXISTS "knowledge_chunks_hnsw_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);

      COMMIT;
    `);

    console.log("[+] DDL Schema updates applied successfully.");

    // 3. Run Idempotent Data Migrations (inside transaction)
    console.log("[*] Commencing idempotent data migration...");

    await pool.query(`
      BEGIN;

      -- Create temp mapping table to map legacy user_id to org_id
      CREATE TEMP TABLE IF NOT EXISTS migration_map (
        legacy_user_id uuid UNIQUE,
        org_id uuid UNIQUE
      );

      -- Populate the map only for users who don't already have an owner organization
      INSERT INTO migration_map (legacy_user_id, org_id)
      SELECT u.id, gen_random_uuid()
      FROM users u
      LEFT JOIN organization_members om ON om.user_id = u.id AND om.role = 'owner'
      WHERE om.id IS NULL
      ON CONFLICT DO NOTHING;

      -- Create organizations for those mapped users
      INSERT INTO organizations (id, name, plan_id, subscription_status)
      SELECT 
        mm.org_id, 
        u.email || '''s Workspace', 
        '00000000-0000-0000-0000-000000000001',
        'active'
      FROM users u
      JOIN migration_map mm ON mm.legacy_user_id = u.id
      ON CONFLICT DO NOTHING;

      -- Insert organization_members mappings as owner
      INSERT INTO organization_members (organization_id, user_id, role)
      SELECT mm.org_id, mm.legacy_user_id, 'owner'
      FROM migration_map mm
      ON CONFLICT DO NOTHING;

      -- Link projects to the correct organization
      UPDATE projects p
      SET organization_id = om.organization_id
      FROM organization_members om
      WHERE om.user_id = p.user_id AND p.organization_id IS NULL;

      -- Link other user/project items to the correct organization
      UPDATE user_api_keys uak
      SET organization_id = om.organization_id
      FROM organization_members om
      WHERE om.user_id = uak.user_id AND uak.organization_id IS NULL;

      UPDATE connected_services cs
      SET organization_id = om.organization_id
      FROM organization_members om
      WHERE om.user_id = cs.user_id AND cs.organization_id IS NULL;

      UPDATE api_logs al
      SET organization_id = om.organization_id
      FROM organization_members om
      WHERE om.user_id = al.user_id AND al.organization_id IS NULL;

      UPDATE payments pay
      SET organization_id = om.organization_id
      FROM organization_members om
      WHERE om.user_id = pay.user_id AND pay.organization_id IS NULL;

      UPDATE whatsapp_connections wc
      SET organization_id = p.organization_id
      FROM projects p
      WHERE p.id = wc.project_id AND wc.organization_id IS NULL;

      DROP TABLE IF EXISTS migration_map;

      COMMIT;
    `);

    console.log("[+] Idempotent data migration applied successfully.");

    // 4. Post-migration checks and counts validation
    const postUsersCount = (await pool.query("SELECT COUNT(*) FROM users;")).rows[0].count;
    const postProjectsCount = (await pool.query("SELECT COUNT(*) FROM projects;")).rows[0].count;
    const postPaymentsCount = (await pool.query("SELECT COUNT(*) FROM payments;")).rows[0].count;
    const postUserKeysCount = (await pool.query("SELECT COUNT(*) FROM user_api_keys;")).rows[0].count;
    const postWAConnectionsCount = (await pool.query("SELECT COUNT(*) FROM whatsapp_connections;")).rows[0].count;
    const postConnectedServicesCount = (await pool.query("SELECT COUNT(*) FROM connected_services;")).rows[0].count;

    const unmappedProjects = (await pool.query("SELECT COUNT(*) FROM projects WHERE organization_id IS NULL;")).rows[0].count;
    const totalOrgs = (await pool.query("SELECT COUNT(*) FROM organizations;")).rows[0].count;
    const totalMembers = (await pool.query("SELECT COUNT(*) FROM organization_members;")).rows[0].count;

    console.log("\n[+] Post-Migration Verification Metrics:");
    console.log(`    - Users: ${postUsersCount} (Expected: ${preUsersCount})`);
    console.log(`    - Projects: ${postProjectsCount} (Expected: ${preProjectsCount})`);
    console.log(`    - Payments: ${postPaymentsCount} (Expected: ${prePaymentsCount})`);
    console.log(`    - User API Keys: ${postUserKeysCount} (Expected: ${preUserKeysCount})`);
    console.log(`    - WhatsApp Connections: ${postWAConnectionsCount} (Expected: ${preWAConnectionsCount})`);
    console.log(`    - Connected Services: ${postConnectedServicesCount} (Expected: ${preConnectedServicesCount})`);
    console.log(`    - Total Organizations: ${totalOrgs}`);
    console.log(`    - Total Workspace Members: ${totalMembers}`);
    console.log(`    - Unmapped Projects left: ${unmappedProjects} (Expected: 0)`);

    const integrityOk = 
      preUsersCount === postUsersCount &&
      preProjectsCount === postProjectsCount &&
      prePaymentsCount === postPaymentsCount &&
      preUserKeysCount === postUserKeysCount &&
      preWAConnectionsCount === postWAConnectionsCount &&
      preConnectedServicesCount === postConnectedServicesCount &&
      Number(unmappedProjects) === 0;

    if (integrityOk) {
      console.log("\n✅ INTEGRITY VERIFICATION SUCCEEDED: Data counts are consistent, and all projects are mapped.");
    } else {
      console.error("\n❌ INTEGRITY VERIFICATION FAILED: Mismatched row counts or unmapped projects detected.");
      process.exit(1);
    }

  } catch (err) {
    console.error("\n❌ MIGRATION ENCOUNTERED AN ERROR:", err);
    await pool.query("ROLLBACK;").catch(() => {});
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
