import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  await client.connect();
  const res = await client.query('SELECT * FROM project_api_keys LIMIT 5');
  console.log("API Keys found:", res.rows.length);
  res.rows.forEach(r => console.log(r.id, r.provider, r.status));
  await client.end();
}

main().catch(console.error);
