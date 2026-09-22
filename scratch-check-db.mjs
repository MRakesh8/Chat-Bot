import dotenv from "dotenv";
import path from "path";
import pg from "pg";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Total projects
    const { rows: projects } = await pool.query("SELECT id, organization_id, user_id, name FROM projects");
    console.log("Total Projects:", projects.length);
    console.log("Projects:", JSON.stringify(projects, null, 2));

    // Connected services
    const { rows: services } = await pool.query("SELECT id, organization_id FROM connected_services");
    console.log("Total Services:", services.length);
    console.log("Services:", JSON.stringify(services, null, 2));

    // Users and organizations
    const { rows: users } = await pool.query("SELECT id, email, role FROM users");
    console.log("Users:", JSON.stringify(users, null, 2));

    const { rows: orgs } = await pool.query("SELECT id, name FROM organizations");
    console.log("Orgs:", JSON.stringify(orgs, null, 2));

    const { rows: members } = await pool.query("SELECT id, organization_id, user_id, role FROM organization_members");
    console.log("Memberships:", JSON.stringify(members, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
