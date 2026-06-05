import pg from 'pg'; 
const { Client } = pg; 
const client = new Client({ connectionString: 'postgresql://postgres:3MKhSQsllY88rei4@db.dirvyhkvyplwtnenbuqo.supabase.co:5432/postgres' }); 
client.connect().then(() => client.query("INSERT INTO chat_sessions (title, project_id) VALUES ('test', null) RETURNING *")).then(res => console.log(res.rows)).catch(console.error).finally(() => client.end());
