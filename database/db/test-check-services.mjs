import pg from "pg";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new pg.Pool({ connectionString });
  try {
    const { rows: services } = await pool.query("SELECT id, provider, organization_id, user_id FROM connected_services");
    console.log("Services with NULL org:", services.filter(s => !s.organization_id).length);
    console.log("All services:", services);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
