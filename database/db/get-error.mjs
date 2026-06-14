import pg from 'pg';
import "dotenv/config";

const { Client } = pg;

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    
    try {
      await client.query("select * from project_widget_settings where project_id = $1", ["00000000-0000-0000-0000-000000000000"]);
    } catch (queryError) {
      console.error("EXACT ERROR MESSAGE:");
      console.error(queryError.message);
      console.error("\nPOSTGRES ERROR CODE:", queryError.code);
      console.error("\nSTACK TRACE:");
      console.error(queryError.stack);
    }

  } catch (err) {
    console.error("Connection failed:", err);
  } finally {
    await client.end();
  }
}

run();
