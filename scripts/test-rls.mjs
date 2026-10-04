import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function test() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.bypass_rls', 'false', true)");
    await client.query("SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000000', true)");
    const res = await client.query('SELECT * FROM project_local_sessions');
    console.log('Result count with fake org:', res.rows.length);
    const rls = await client.query("SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'project_local_sessions'");
    console.log('Table security:', rls.rows);
    const policies = await client.query("SELECT * FROM pg_policies WHERE tablename = 'project_local_sessions'");
    console.log('Policies:', policies.rows);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
test();
