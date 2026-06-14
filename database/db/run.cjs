const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  try {
    await pool.query('ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT \'[]\'::jsonb NOT NULL;');
    console.log('Added tags column to projects');
    
    await pool.query(`CREATE TABLE IF NOT EXISTS "connected_services" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "provider" varchar(50) NOT NULL,
      "name" text NOT NULL,
      "url" text NOT NULL,
      "description" text,
      "status" varchar(50) DEFAULT 'Connected' NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    );`);
    console.log('Created connected_services table');
    
    await pool.query('ALTER TABLE "connected_services" DROP CONSTRAINT IF EXISTS "connected_services_user_id_users_id_fk";');
    await pool.query('ALTER TABLE "connected_services" ADD CONSTRAINT "connected_services_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;');
    console.log('Added foreign key constraint');
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();
