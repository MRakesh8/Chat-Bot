import { config } from "dotenv";
config({ path: "../../.env" });
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  const res = await pool.query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10");
  console.log(res.rows);
  process.exit(0);
}
run();
