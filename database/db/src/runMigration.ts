import pg from "pg";
const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const sql = `
CREATE TABLE IF NOT EXISTS "user_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" varchar(255),
	"provider" varchar(50) DEFAULT 'gemini' NOT NULL,
	"encrypted_key" text NOT NULL,
	"masked_key" varchar(50) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"status" varchar(50) DEFAULT 'HEALTHY' NOT NULL,
	"last_success" timestamp,
	"last_failure" timestamp,
	"failure_reason" text,
	"cooldown_until" timestamp,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"total_failures" integer DEFAULT 0 NOT NULL,
	"daily_limit" integer,
	"daily_used" integer DEFAULT 0 NOT NULL,
	"last_reset_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_api_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"api_mode" varchar(50) DEFAULT 'auto' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "knowledge_retrieval_cache" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"result_text" text NOT NULL,
	"retrieved_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
  `;
  await client.query(sql);
  console.log("Migration executed");
  await client.end();
}
run().catch(console.error);
