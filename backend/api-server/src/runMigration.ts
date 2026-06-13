import { Client } from "pg";
import fs from "fs";

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const sql = fs.readFileSync("../../database/db/drizzle/0000_purple_kid_colt.sql", "utf-8");
  // Split by statement-breakpoint if needed, but pg can usually run multiple statements
  await client.query(sql.replace(/--> statement-breakpoint/g, ";"));
  console.log("Migration executed");
  await client.end();
}
run().catch(console.error);
