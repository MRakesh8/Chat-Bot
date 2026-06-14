import pg from 'pg';
import "dotenv/config";

const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    
    const tables = ['project_widget_settings', 'widget_settings', 'project_api_keys', 'widget_analytics'];
    
    for (const table of tables) {
      const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [table]);
      console.log(`Table ${table} exists:`, res.rows.length > 0);
    }
  } catch (err) {
    console.error("Query failed:", err);
  } finally {
    await client.end();
  }
}

run();
