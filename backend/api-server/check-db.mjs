import { config } from "dotenv";
config({ path: "../../.env" });
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  const res = await pool.query("SELECT id, model, provider FROM project_api_keys WHERE provider = 'gemini' LIMIT 1");
  console.log(res.rows);
  process.exit(0);
}
run();
