import pg from 'pg';
import "dotenv/config";

const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log("Connected to database. Applying safe migration...");
    
    const result = await client.query(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;`);
    console.log("Migration executed successfully.");
    console.log("Result:", result.command);
    
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
