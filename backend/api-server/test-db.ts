import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ path: "./backend/api-server/.env" });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  try {
    const dbSize = await db.execute(sql`SELECT pg_size_pretty(pg_database_size(current_database())) as size, pg_database_size(current_database()) as bytes`);
    console.log("DB Size:", dbSize.rows[0]);

    const storageSize = await db.execute(sql`SELECT SUM(COALESCE((metadata->>'size')::bigint, 0)) as bytes FROM storage.objects`);
    console.log("Storage Size:", storageSize.rows[0]);
    
    const userStorage = await db.execute(sql`
      SELECT owner as user_id, SUM(COALESCE((metadata->>'size')::bigint, 0)) as bytes 
      FROM storage.objects 
      GROUP BY owner
    `);
    console.log("User Storage:", userStorage.rows);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await pool.end();
  }
}
main();
