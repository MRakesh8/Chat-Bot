import { config } from "dotenv";
config({ path: "../../.env" });
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  console.log(res.rows.map(r => r.table_name));
  process.exit(0);
}
run();
