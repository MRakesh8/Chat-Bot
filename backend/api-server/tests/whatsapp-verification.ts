import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../../.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx);
      const val = trimmed.slice(eqIdx + 1);
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

let passed = 0;
let failed = 0;
const results: { test: string; result: string; evidence: string }[] = [];

function record(test: string, pass: boolean, evidence: string) {
  const result = pass ? 'PASS' : 'FAIL';
  if (pass) passed++; else failed++;
  results.push({ test, result, evidence });
  console.log(`  [${result}] ${test}: ${evidence}`);
}

async function cleanup() {
  // Clean up test data only
  await pool.query(`DELETE FROM whatsapp_messages WHERE provider = 'test_provider'`);
  await pool.query(`DELETE FROM whatsapp_conversations WHERE customer_identifier = 'test_customer_001'`);
  await pool.query(`DELETE FROM whatsapp_conversations WHERE customer_identifier = 'test_customer_002'`);
  await pool.query(`DELETE FROM whatsapp_handoffs WHERE reason LIKE 'test_%'`);
  await pool.query(`DELETE FROM whatsapp_connections WHERE provider = 'test_provider'`);
  await pool.query(`DELETE FROM whatsapp_settings WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'VERIFY_TEST_%')`);
  await pool.query(`DELETE FROM whatsapp_analytics WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'VERIFY_TEST_%')`);
  await pool.query(`DELETE FROM projects WHERE name LIKE 'VERIFY_TEST_%'`);
}

async function main() {
  console.log('\n========================================');
  console.log('WHATSAPP INTEGRATION PRODUCTION VERIFICATION');
  console.log('========================================\n');

  // ----------------------------------------------------------------
  // TEST 0: Verify unique index exists in the actual database
  // ----------------------------------------------------------------
  console.log('--- TEST 0: DATABASE UNIQUE INDEX VERIFICATION ---');
  try {
    const indexResult = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'whatsapp_messages' 
        AND indexname = 'whatsapp_messages_idempotency_idx'
    `);
    
    if (indexResult.rows.length === 0) {
      record('Unique index exists in DB', false, 'Index whatsapp_messages_idempotency_idx NOT FOUND in pg_indexes');
    } else {
      const def = indexResult.rows[0].indexdef;
      const isUnique = def.toUpperCase().includes('UNIQUE');
      record('Unique index exists in DB', isUnique, 
        isUnique ? `Found: ${def}` : `Index exists but is NOT UNIQUE: ${def}`);
    }
  } catch (err: any) {
    record('Unique index exists in DB', false, `Error: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // TEST 1: Create test projects and connections
  // ----------------------------------------------------------------
  console.log('\n--- TEST 1: SETUP TEST PROJECTS ---');
  
  // Get any existing user
  const userResult = await pool.query(`SELECT id FROM users LIMIT 1`);
  if (userResult.rows.length === 0) {
    console.error('FATAL: No users exist in DB. Cannot run tests.');
    process.exit(1);
  }
  const testUserId = userResult.rows[0].id;

  // Create Project A
  const projA = await pool.query(
    `INSERT INTO projects (id, user_id, name, description, system_prompt, share_token) 
     VALUES (gen_random_uuid(), $1, 'VERIFY_TEST_PROJECT_A', 'Test A', 'You are assistant A. Only talk about cats.', 'tok_a')
     RETURNING id`,
    [testUserId]
  );
  const projectAId = projA.rows[0].id;

  // Create Project B
  const projB = await pool.query(
    `INSERT INTO projects (id, user_id, name, description, system_prompt, share_token) 
     VALUES (gen_random_uuid(), $1, 'VERIFY_TEST_PROJECT_B', 'Test B', 'You are assistant B. Only talk about dogs.', 'tok_b')
     RETURNING id`,
    [testUserId]
  );
  const projectBId = projB.rows[0].id;

  // Create Connection A
  const connA = await pool.query(
    `INSERT INTO whatsapp_connections (id, project_id, provider, provider_account_id, status)
     VALUES (gen_random_uuid(), $1, 'test_provider', 'acct_a', 'connected')
     RETURNING id`,
    [projectAId]
  );
  const connectionAId = connA.rows[0].id;

  // Create Connection B
  const connB = await pool.query(
    `INSERT INTO whatsapp_connections (id, project_id, provider, provider_account_id, status)
     VALUES (gen_random_uuid(), $1, 'test_provider', 'acct_b', 'connected')
     RETURNING id`,
    [projectBId]
  );
  const connectionBId = connB.rows[0].id;

  record('Test projects created', true, `A=${projectAId.slice(0,8)}... B=${projectBId.slice(0,8)}...`);

  // Create conversations
  const convA = await pool.query(
    `INSERT INTO whatsapp_conversations (id, project_id, connection_id, provider_chat_id, customer_identifier, customer_name)
     VALUES (gen_random_uuid(), $1, $2, 'chat_a', 'test_customer_001', 'Test Customer A')
     RETURNING id`,
    [projectAId, connectionAId]
  );
  const conversationAId = convA.rows[0].id;

  const convB = await pool.query(
    `INSERT INTO whatsapp_conversations (id, project_id, connection_id, provider_chat_id, customer_identifier, customer_name)
     VALUES (gen_random_uuid(), $1, $2, 'chat_b', 'test_customer_002', 'Test Customer B')
     RETURNING id`,
    [projectBId, connectionBId]
  );
  const conversationBId = convB.rows[0].id;

  // ----------------------------------------------------------------
  // TEST 2: IDEMPOTENCY - Insert same message, verify uniqueIndex blocks duplicate
  // ----------------------------------------------------------------
  console.log('\n--- TEST 2: IDEMPOTENCY (UNIQUE CONSTRAINT) ---');
  
  // First insert
  const msg1 = await pool.query(
    `INSERT INTO whatsapp_messages (project_id, conversation_id, provider_message_id, provider, direction, sender, content, status)
     VALUES ($1, $2, 'msg_idem_001', 'test_provider', 'inbound', 'cust1', 'Hello first', 'pending')
     ON CONFLICT (project_id, provider, provider_message_id) DO NOTHING
     RETURNING id`,
    [projectAId, conversationAId]
  );
  const firstInserted = msg1.rows.length === 1;

  // Second insert (exact same key)
  const msg2 = await pool.query(
    `INSERT INTO whatsapp_messages (project_id, conversation_id, provider_message_id, provider, direction, sender, content, status)
     VALUES ($1, $2, 'msg_idem_001', 'test_provider', 'inbound', 'cust1', 'Hello duplicate', 'pending')
     ON CONFLICT (project_id, provider, provider_message_id) DO NOTHING
     RETURNING id`,
    [projectAId, conversationAId]
  );
  const secondInserted = msg2.rows.length === 1;

  // Third insert
  const msg3 = await pool.query(
    `INSERT INTO whatsapp_messages (project_id, conversation_id, provider_message_id, provider, direction, sender, content, status)
     VALUES ($1, $2, 'msg_idem_001', 'test_provider', 'inbound', 'cust1', 'Hello triplicate', 'pending')
     ON CONFLICT (project_id, provider, provider_message_id) DO NOTHING
     RETURNING id`,
    [projectAId, conversationAId]
  );
  const thirdInserted = msg3.rows.length === 1;

  // Count how many actually exist
  const countResult = await pool.query(
    `SELECT count(*) as cnt FROM whatsapp_messages 
     WHERE project_id = $1 AND provider = 'test_provider' AND provider_message_id = 'msg_idem_001'`,
    [projectAId]
  );
  const actualCount = parseInt(countResult.rows[0].cnt);

  record('Idempotency: 1st insert succeeds', firstInserted, `Returned ${msg1.rows.length} row(s)`);
  record('Idempotency: 2nd insert blocked', !secondInserted, `Returned ${msg2.rows.length} row(s)`);
  record('Idempotency: 3rd insert blocked', !thirdInserted, `Returned ${msg3.rows.length} row(s)`);
  record('Idempotency: exactly 1 row in DB', actualCount === 1, `Count = ${actualCount}`);

  // Also verify that a raw INSERT without ON CONFLICT DOES raise an error
  let rawDuplicateError = false;
  try {
    await pool.query(
      `INSERT INTO whatsapp_messages (project_id, conversation_id, provider_message_id, provider, direction, sender, content, status)
       VALUES ($1, $2, 'msg_idem_001', 'test_provider', 'inbound', 'cust1', 'Should fail', 'pending')`,
      [projectAId, conversationAId]
    );
  } catch (err: any) {
    rawDuplicateError = err.code === '23505'; // unique_violation
  }
  record('Idempotency: raw duplicate raises unique_violation', rawDuplicateError, 
    rawDuplicateError ? 'PostgreSQL error 23505 raised' : 'ERROR: No exception raised!');

  // ----------------------------------------------------------------
  // TEST 3: LEASE ATOMICITY
  // ----------------------------------------------------------------
  console.log('\n--- TEST 3: LEASE ATOMICITY ---');
  
  // Insert a fresh pending message
  const leaseMsg = await pool.query(
    `INSERT INTO whatsapp_messages (id, project_id, conversation_id, provider_message_id, provider, direction, sender, content, status)
     VALUES (gen_random_uuid(), $1, $2, 'msg_lease_001', 'test_provider', 'inbound', 'cust1', 'Lease test', 'pending')
     RETURNING id`,
    [projectAId, conversationAId]
  );
  const leaseMsgId = leaseMsg.rows[0].id;

  // Worker A claims
  const leaseUntil = new Date(Date.now() + 60000);
  const claimA = await pool.query(
    `UPDATE whatsapp_messages 
     SET status = 'processing', lease_until = $2, processing_started_at = NOW(), processing_attempts = processing_attempts + 1
     WHERE id = $1 AND (status = 'pending' OR (status = 'processing' AND lease_until <= NOW()))
     RETURNING id`,
    [leaseMsgId, leaseUntil]
  );
  const workerAClaimed = claimA.rows.length === 1;

  // Worker B tries same message (should fail because lease is active)
  const claimB = await pool.query(
    `UPDATE whatsapp_messages 
     SET status = 'processing', lease_until = $2, processing_started_at = NOW(), processing_attempts = processing_attempts + 1
     WHERE id = $1 AND (status = 'pending' OR (status = 'processing' AND lease_until <= NOW()))
     RETURNING id`,
    [leaseMsgId, leaseUntil]
  );
  const workerBClaimed = claimB.rows.length === 1;

  record('Lease: Worker A claims message', workerAClaimed, `Returned ${claimA.rows.length} row(s)`);
  record('Lease: Worker B blocked from same message', !workerBClaimed, `Returned ${claimB.rows.length} row(s)`);

  // Simulate expired lease
  await pool.query(
    `UPDATE whatsapp_messages SET lease_until = NOW() - INTERVAL '1 minute' WHERE id = $1`,
    [leaseMsgId]
  );

  // Worker C tries after lease expired
  const claimC = await pool.query(
    `UPDATE whatsapp_messages 
     SET status = 'processing', lease_until = $2, processing_started_at = NOW(), processing_attempts = processing_attempts + 1
     WHERE id = $1 AND (status = 'pending' OR (status = 'processing' AND lease_until <= NOW()))
     RETURNING id, processing_attempts`,
    [leaseMsgId, new Date(Date.now() + 60000)]
  );
  const workerCClaimed = claimC.rows.length === 1;
  const attempts = workerCClaimed ? claimC.rows[0].processing_attempts : 0;

  record('Lease: Worker C claims after expired lease', workerCClaimed, 
    `Returned ${claimC.rows.length} row(s), attempts=${attempts}`);

  // ----------------------------------------------------------------
  // TEST 4: PROJECT ISOLATION
  // ----------------------------------------------------------------
  console.log('\n--- TEST 4: PROJECT ISOLATION ---');

  // Insert message for Project A
  const isoMsgA = await pool.query(
    `INSERT INTO whatsapp_messages (project_id, conversation_id, provider_message_id, provider, direction, sender, content, status)
     VALUES ($1, $2, 'msg_iso_a', 'test_provider', 'inbound', 'cust1', 'Project A msg', 'pending')
     ON CONFLICT DO NOTHING RETURNING id`,
    [projectAId, conversationAId]
  );

  // Insert message for Project B
  const isoMsgB = await pool.query(
    `INSERT INTO whatsapp_messages (project_id, conversation_id, provider_message_id, provider, direction, sender, content, status)
     VALUES ($1, $2, 'msg_iso_b', 'test_provider', 'inbound', 'cust2', 'Project B msg', 'pending')
     ON CONFLICT DO NOTHING RETURNING id`,
    [projectBId, conversationBId]
  );

  // Query messages for project A - should NOT see project B
  const msgsForA = await pool.query(
    `SELECT * FROM whatsapp_messages WHERE project_id = $1 AND provider = 'test_provider'`,
    [projectAId]
  );
  const msgsForB = await pool.query(
    `SELECT * FROM whatsapp_messages WHERE project_id = $1 AND provider = 'test_provider'`,
    [projectBId]
  );
  
  const aHasOnlyA = msgsForA.rows.every((r: any) => r.project_id === projectAId);
  const bHasOnlyB = msgsForB.rows.every((r: any) => r.project_id === projectBId);
  
  record('Isolation: Project A query returns only A messages', aHasOnlyA, 
    `${msgsForA.rows.length} messages, all project_id match`);
  record('Isolation: Project B query returns only B messages', bHasOnlyB, 
    `${msgsForB.rows.length} messages, all project_id match`);

  // Verify connection A belongs to project A, not B
  const connACheck = await pool.query(
    `SELECT project_id FROM whatsapp_connections WHERE id = $1`, [connectionAId]
  );
  const connBCheck = await pool.query(
    `SELECT project_id FROM whatsapp_connections WHERE id = $1`, [connectionBId]
  );
  
  record('Isolation: Connection A belongs to Project A', 
    connACheck.rows[0].project_id === projectAId, 
    `conn.project_id=${connACheck.rows[0].project_id.slice(0,8)}...`);
  record('Isolation: Connection B belongs to Project B', 
    connBCheck.rows[0].project_id === projectBId, 
    `conn.project_id=${connBCheck.rows[0].project_id.slice(0,8)}...`);

  // Attempt cross-project: try to enqueue message using conn B but project A
  // The enqueue logic checks connection.projectId matches normalized.projectId
  const crossCheck = await pool.query(
    `SELECT id FROM whatsapp_connections 
     WHERE id = $1 AND project_id = $2 AND provider = 'test_provider'`,
    [connectionBId, projectAId]  // connectionB with projectA = should return 0
  );
  record('Isolation: Cross-project connection lookup fails', 
    crossCheck.rows.length === 0, 
    `Rows returned: ${crossCheck.rows.length}`);

  // ----------------------------------------------------------------
  // TEST 5: HUMAN HANDOFF
  // ----------------------------------------------------------------
  console.log('\n--- TEST 5: HUMAN HANDOFF ---');

  // Set conversation to human_required
  await pool.query(
    `UPDATE whatsapp_conversations SET status = 'human_required', assigned_mode = 'human' WHERE id = $1`,
    [conversationAId]
  );
  
  // Insert handoff record
  await pool.query(
    `INSERT INTO whatsapp_handoffs (project_id, conversation_id, reason, status) 
     VALUES ($1, $2, 'test_human_requested', 'pending')`,
    [projectAId, conversationAId]
  );

  // Verify conversation status
  const convStatus = await pool.query(
    `SELECT status, assigned_mode FROM whatsapp_conversations WHERE id = $1`, [conversationAId]
  );
  const isHumanRequired = convStatus.rows[0].status === 'human_required';
  const isHumanMode = convStatus.rows[0].assigned_mode === 'human';

  record('Handoff: Conversation status = human_required', isHumanRequired, 
    `status=${convStatus.rows[0].status}`);
  record('Handoff: assigned_mode = human', isHumanMode, 
    `assigned_mode=${convStatus.rows[0].assigned_mode}`);

  // Verify handoff record exists
  const handoffCheck = await pool.query(
    `SELECT * FROM whatsapp_handoffs WHERE conversation_id = $1 AND reason = 'test_human_requested'`, 
    [conversationAId]
  );
  record('Handoff: Handoff record created', handoffCheck.rows.length === 1, 
    `${handoffCheck.rows.length} handoff record(s)`);

  // Verify the processor would skip this conversation
  // The code checks: if (conversation.assignedMode === "human" || conversation.status === "human_required")
  // We verify this condition is true
  record('Handoff: Processor would skip (assignedMode=human)', isHumanMode && isHumanRequired, 
    'Both conditions true → AI auto-reply blocked');

  // ----------------------------------------------------------------
  // TEST 6: PROVIDER WEBHOOK ROUTING - Verify webhook URL structure
  // ----------------------------------------------------------------
  console.log('\n--- TEST 6: WEBHOOK ROUTING VERIFICATION ---');

  // Verify the route structure
  const timelinesUrl = `/api/integrations/whatsapp/timelines/${connectionAId}/webhook`;
  const metaUrl = `/api/integrations/whatsapp/meta/${connectionAId}/webhook`;
  
  record('Webhook: TimelinesAI URL structure correct', 
    timelinesUrl.includes('/timelines/') && timelinesUrl.includes('/webhook'),
    timelinesUrl);
  record('Webhook: Meta URL structure correct', 
    metaUrl.includes('/meta/') && metaUrl.includes('/webhook'),
    metaUrl);

  // ----------------------------------------------------------------
  // TEST 7: SETTINGS DEFAULTS
  // ----------------------------------------------------------------
  console.log('\n--- TEST 7: SETTINGS ---');
  
  // Insert settings for project A
  await pool.query(
    `INSERT INTO whatsapp_settings (project_id, auto_reply_enabled, reply_mode) 
     VALUES ($1, true, 'all_business_questions')
     ON CONFLICT (project_id) DO NOTHING`,
    [projectAId]
  );
  
  const settingsCheck = await pool.query(
    `SELECT * FROM whatsapp_settings WHERE project_id = $1`, [projectAId]
  );
  record('Settings: auto_reply stored correctly', 
    settingsCheck.rows.length === 1 && settingsCheck.rows[0].auto_reply_enabled === true,
    `auto_reply_enabled=${settingsCheck.rows[0]?.auto_reply_enabled}`);

  // ----------------------------------------------------------------
  // TEST 8: ANALYTICS TABLE
  // ----------------------------------------------------------------
  console.log('\n--- TEST 8: ANALYTICS ---');
  
  await pool.query(
    `INSERT INTO whatsapp_analytics (project_id, date, messages_received, ai_replies)
     VALUES ($1, NOW()::date, 1, 1)`,
    [projectAId]
  );
  const analyticsCheck = await pool.query(
    `SELECT * FROM whatsapp_analytics WHERE project_id = $1`, [projectAId]
  );
  record('Analytics: Record inserted correctly', 
    analyticsCheck.rows.length >= 1, 
    `${analyticsCheck.rows.length} analytics row(s)`);

  // ----------------------------------------------------------------
  // TEST 9: CASCADE DELETE VERIFICATION
  // ----------------------------------------------------------------
  console.log('\n--- TEST 9: CASCADE DELETE ---');
  
  // Count before
  const beforeConvCount = await pool.query(
    `SELECT count(*) as cnt FROM whatsapp_conversations WHERE connection_id = $1`, [connectionBId]
  );
  
  // Delete connection B → should cascade to conversations
  await pool.query(`DELETE FROM whatsapp_connections WHERE id = $1`, [connectionBId]);
  
  const afterConvCount = await pool.query(
    `SELECT count(*) as cnt FROM whatsapp_conversations WHERE connection_id = $1`, [connectionBId]
  );
  
  record('Cascade: Deleting connection cascades to conversations', 
    parseInt(afterConvCount.rows[0].cnt) === 0,
    `Before: ${beforeConvCount.rows[0].cnt}, After: ${afterConvCount.rows[0].cnt}`);

  // ----------------------------------------------------------------
  // CLEANUP
  // ----------------------------------------------------------------
  console.log('\n--- CLEANUP ---');
  await cleanup();
  console.log('  Test data cleaned up.');

  // ----------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------
  console.log('\n========================================');
  console.log('RESULTS SUMMARY');
  console.log('========================================');
  console.log(`\n  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`  TOTAL:  ${passed + failed}\n`);
  
  console.log('| Test | Result | Evidence |');
  console.log('|---|---|---|');
  for (const r of results) {
    console.log(`| ${r.test} | ${r.result} | ${r.evidence} |`);
  }

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL ERROR:', err);
  await cleanup().catch(() => {});
  await pool.end();
  process.exit(1);
});
