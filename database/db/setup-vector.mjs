import pg from "pg";
import { config } from "dotenv";
config({ path: "../../.env" });

const { Client } = pg;

async function setup() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
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
