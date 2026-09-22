import pg from "pg";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new pg.Pool({ connectionString });
  try {
    const { rows: projects } = await pool.query("SELECT id, name, organization_id, user_id FROM projects");
    console.log("Projects with NULL org:", projects.filter(p => !p.organization_id).length);
    console.log("All projects:", projects);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
