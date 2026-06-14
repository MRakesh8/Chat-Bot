import pg from 'pg'; 
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve("../../.env") });

const { Client } = pg; 
const client = new Client({ connectionString: process.env.DATABASE_URL }); 

async function run() {
  try {
    await client.connect();
    console.log("Connected to database.");

    const token = '2ca32dba01a94b00f29c3aabe5c9e7e54213e461b4fc08482e796ccd9fc8c24b';

    // 1. Get project widget settings
    const widgetRes = await client.query(
      `SELECT * FROM project_widget_settings WHERE widget_token = $1`,
      [token]
    );
    console.log("\n--- Project Widget Settings ---");
    console.log(widgetRes.rows);

    if (widgetRes.rows.length === 0) {
      console.log("No widget settings found for this token.");
      return;
    }

    const projectId = widgetRes.rows[0].project_id;
    console.log(`\nProject ID: ${projectId}`);

    // 2. Get project API keys
    const projectKeysRes = await client.query(
      `SELECT id, provider, is_enabled, model FROM project_api_keys WHERE project_id = $1`,
      [projectId]
    );
    console.log("\n--- Project API Keys ---");
    console.log(projectKeysRes.rows);

    // 3. Get system API keys
    const systemKeysRes = await client.query(
      `SELECT id, provider, is_enabled, is_system FROM user_api_keys WHERE is_system = true`
    );
    console.log("\n--- System API Keys ---");
    console.log(systemKeysRes.rows);

  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    await client.end();
  }
}

run();
