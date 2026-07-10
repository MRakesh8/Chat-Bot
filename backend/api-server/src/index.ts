import app from "./app";
import { logger } from "./lib/logger";
import { startCleanupTask } from "./lib/cleanup";
import { startApiKeyHealthCheckTask } from "./lib/apiKeyHealthCheck";
import { runMigrations } from "./lib/migrate";
import { validateDatabaseSchema } from "./middlewares/databaseHealth";
import puppeteer from "puppeteer";
import fs from "fs";

const rawPort = process.env["PORT"];


const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  try {
    await runMigrations();
  } catch (err) {
    logger.error(err, "Failed to run migrations on startup");
  }

  // Hotfix: Add missing columns and tables to database since Drizzle push wasn't run
  try {
    const { pool } = await import("@workspace/db");
    
    // Add columns
    await pool.query(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deployment_paid" boolean DEFAULT false;`);
    await pool.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "features" jsonb DEFAULT '{"canCreateProject":true,"canUseWidgetStudio":false,"canUseContextEngine":false}'::jsonb NOT NULL;`);
    
    // Create Plans table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "plans" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(100) NOT NULL,
        "price" integer NOT NULL,
        "currency" varchar(10) DEFAULT 'INR' NOT NULL,
        "interval" varchar(50) DEFAULT 'lifetime' NOT NULL,
        "features" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create Project Licenses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "project_licenses" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "plan_id" uuid REFERENCES "plans"("id") ON DELETE SET NULL,
        "license_status" varchar(50) DEFAULT 'inactive' NOT NULL,
        "payment_status" varchar(50) DEFAULT 'pending' NOT NULL,
        "payment_date" timestamp,
        "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "approved_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create Payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "amount" integer NOT NULL,
        "currency" varchar(10) DEFAULT 'INR' NOT NULL,
        "status" varchar(50) DEFAULT 'pending' NOT NULL,
        "method" varchar(50) NOT NULL,
        "utr_transaction_id" varchar(255),
        "screenshot_url" text,
        "metadata" jsonb DEFAULT '{}'::jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create Payment Logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "payment_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "payment_id" uuid NOT NULL REFERENCES "payments"("id") ON DELETE CASCADE,
        "action" varchar(100) NOT NULL,
        "performed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create indexes if they don't exist
    await pool.query(`CREATE INDEX IF NOT EXISTS "project_licenses_project_id_idx" ON "project_licenses" ("project_id");`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "payments_project_id_idx" ON "payments" ("project_id");`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "payments_user_id_idx" ON "payments" ("user_id");`);

    logger.info("Hotfix: Auto-migrated schema (columns and payment tables) successfully.");
  } catch (err: any) {
    logger.error(err, "Hotfix: Failed to auto-migrate schema. (Tables might exist or DB error)");
  }

  try {
    const executablePath = await puppeteer.executablePath();
    if (!fs.existsSync(executablePath)) {
      logger.error(`[PUPPETEER] Chrome executable not found at ${executablePath}. PDF generation will fail.`);
    } else {
      logger.info(`[PUPPETEER] Chrome verified at ${executablePath}`);
    }
  } catch (e: any) {
    logger.error({ err: e }, "[PUPPETEER] Failed to resolve Chrome path");
  }

  logger.info("[STARTUP] SERVER_START");

  const server = app.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "[STARTUP] Server listening on port " + port);
    logger.info("[STARTUP] HEALTH_ENDPOINT_READY");
    startCleanupTask();
    startApiKeyHealthCheckTask();
    
    // Background validation
    validateDatabaseSchema().catch((err) => {
      logger.error({ err }, "[DB] Background validation failed");
    });
  });

  server.on("error", (err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
}

start();
