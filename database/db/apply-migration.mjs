import pg from 'pg';
import fs from 'fs';
import "dotenv/config";

const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log("Connected to database. Applying migration...");
    
    const sql = fs.readFileSync("drizzle/0003_red_sunset_bain.sql", "utf-8");
    
    // Drizzle uses --> statement-breakpoint, so we split and run
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(s => s.length > 0);
    
    for (const stmt of statements) {
      await client.query(stmt);
      console.log("Executed statement successfully.");
    }
    
    console.log("MIGRATION COMPLETE.");
    
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
