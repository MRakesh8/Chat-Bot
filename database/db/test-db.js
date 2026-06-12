import pg from 'pg'; 
import { config } from "dotenv";
config({ path: "../../.env" });
const { Client } = pg; 
const client = new Client({ connectionString: process.env.DATABASE_URL }); 
client.connect().then(() => client.query("INSERT INTO chat_sessions (title, project_id) VALUES ('test', null) RETURNING *")).then(res => console.log(res.rows)).catch(console.error).finally(() => client.end());
