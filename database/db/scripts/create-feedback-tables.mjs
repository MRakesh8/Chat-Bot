import pg from "pg";
import "dotenv/config";

const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected to PostgreSQL database...");

  const sql = `
CREATE TABLE IF NOT EXISTS "message_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"session_id" uuid NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
	"message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
	"customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
	"type" varchar(50) NOT NULL,
	"comment" text,
	"channel" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "notification_settings" (
	"project_id" uuid PRIMARY KEY NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"notify_on_dislikes" integer DEFAULT 3 NOT NULL,
	"notify_on_likes" integer DEFAULT 3 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(255) NOT NULL,
	"project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"type" varchar(50) NOT NULL,
	"severity" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"reference_id" uuid,
	"read_at" timestamp,
	"dedupe_key" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
	"category" varchar(100),
	"rating" integer,
	"comment" text NOT NULL,
	"channel" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "message_feedback_project_id_idx" ON "message_feedback" ("project_id");
CREATE INDEX IF NOT EXISTS "message_feedback_message_id_idx" ON "message_feedback" ("message_id");
CREATE INDEX IF NOT EXISTS "notifications_project_id_idx" ON "notifications" ("project_id");
CREATE INDEX IF NOT EXISTS "notifications_org_id_idx" ON "notifications" ("organization_id");
CREATE INDEX IF NOT EXISTS "notifications_dedupe_key_idx" ON "notifications" ("dedupe_key");
CREATE INDEX IF NOT EXISTS "project_feedback_project_id_idx" ON "project_feedback" ("project_id");
  `;

  await client.query(sql);
  console.log("Feedback & Notification tables ensured in database successfully.");
  await client.end();
}

run().catch((e) => {
  console.error("Migration error:", e);
  process.exit(1);
});
