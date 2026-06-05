import pg from "pg";

const { Client } = pg;

async function setup() {
  const client = new Client({
    connectionString: "postgresql://postgres:3MKhSQsllY88rei4@db.dirvyhkvyplwtnenbuqo.supabase.co:5432/postgres",
  });

  try {
    await client.connect();
    console.log("Connected to Supabase PostgreSQL.");
    await client.query("CREATE EXTENSION IF NOT EXISTS vector;");
    console.log("pgvector extension created or already exists.");
  } catch (error) {
    console.error("Error setting up pgvector:", error);
  } finally {
    await client.end();
  }
}

setup();
