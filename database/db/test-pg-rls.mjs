import pg from "pg";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const orgId = '9184ffed-50ae-4d95-8aa3-33e8d68bf82e';
    const userId = 'b16cd5e5-606e-450d-a369-dd54a256a8b5';
    await client.query("BEGIN");
    
    // Set config
    await client.query(`SELECT set_config('app.current_organization_id', $1, true)`, [orgId]);
    
    // Query projects using same query
    const res = await client.query(`
      SELECT projects.id, count(knowledge_sources.id) as knowledge_count
      FROM projects 
      LEFT JOIN knowledge_sources ON projects.id = knowledge_sources.project_id
      WHERE projects.organization_id = $1
      GROUP BY projects.id
      ORDER BY projects.created_at DESC
    `, [orgId]);
    
    console.log("Projects found with JOIN:", res.rows.length);
    console.log(res.rows);
    
    await client.query("COMMIT");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}
run();
