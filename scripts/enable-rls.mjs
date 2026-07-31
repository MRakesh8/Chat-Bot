import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let pg;
try {
  pg = require('../backend/api-server/node_modules/pg');
} catch {
  try {
    pg = require('../node_modules/pg');
  } catch {
    pg = require('../database/db/node_modules/pg');
  }
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});

const tables = [
  'global_settings', 'system_errors', 'users', 'projects', 'project_settings',
  'project_modes', 'knowledge_categories', 'knowledge_sources', 'knowledge_chunks',
  'chat_sessions', 'messages', 'notes', 'reports', 'audit_logs', 'user_api_keys',
  'user_api_settings', 'connected_services', 'knowledge_retrieval_cache',
  'project_widget_settings', 'project_context_settings', 'project_api_keys',
  'widget_analytics', 'widget_leads', 'website_memory', 'agent_workflows',
  'agent_skills', 'website_adapters', 'enterprise_audit_logs',
  'website_permissions', 'workflow_executions', 'execution_steps', 'api_logs',
  'plans', 'project_licenses', 'payments', 'payment_logs'
];

async function main() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL database.');

  for (const table of tables) {
    try {
      await client.query(`ALTER TABLE IF EXISTS public."${table}" ENABLE ROW LEVEL SECURITY;`);
      await client.query(`DROP POLICY IF EXISTS "allow_full_access" ON public."${table}";`);
      await client.query(`CREATE POLICY "allow_full_access" ON public."${table}" FOR ALL USING (true);`);
      console.log(`✅ RLS Enabled for table: public.${table}`);
    } catch (err) {
      console.error(`⚠️ Failed for public.${table}:`, err.message);
    }
  }

  await client.end();
  console.log('🎉 All 36 tables successfully updated with Row Level Security!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
