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
  console.log("[*] Adding connector_token column to project_local_sessions if missing...");

  try {
    await pool.query(`
      ALTER TABLE "project_local_sessions" 
      ADD COLUMN IF NOT EXISTS "connector_token" varchar(255);

      CREATE INDEX IF NOT EXISTS "project_local_sessions_conn_token_idx" 
      ON "project_local_sessions" ("connector_token");
    `);
    console.log("[+] connector_token column and index added successfully.");
  } catch (err) {
    console.error("[-] Failed to update project_local_sessions table:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
