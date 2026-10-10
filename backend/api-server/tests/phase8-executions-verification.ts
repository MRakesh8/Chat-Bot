import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
import { db, pool, agentExecutions, projects, organizations, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createExecution,
  getProjectExecutions,
  getExecutionById,
  cancelExecution,
  retryExecution,
  approveExecution,
  sanitizePayload,
  isExecutionCancelled,
} from "../src/services/execution-governance";

async function runPhase8Tests() {
  console.log("================================================================================");
  console.log("  PHASE 8 — EXECUTION GOVERNANCE & LIFECYCLE VERIFICATION TEST SUITE");
  console.log("================================================================================");

  // Ensure agent_executions table exists in PostgreSQL database
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
        agent_type VARCHAR(100) NOT NULL DEFAULT 'business_agent',
        title TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        output_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        error TEXT,
        steps JSONB NOT NULL DEFAULT '[]'::jsonb,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        approval_token VARCHAR(255),
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS agent_executions_project_id_idx ON agent_executions(project_id);
      CREATE INDEX IF NOT EXISTS agent_executions_org_id_idx ON agent_executions(organization_id);
      CREATE INDEX IF NOT EXISTS agent_executions_user_id_idx ON agent_executions(user_id);
      CREATE INDEX IF NOT EXISTS agent_executions_status_idx ON agent_executions(project_id, status);
      CREATE INDEX IF NOT EXISTS agent_executions_created_idx ON agent_executions(project_id, created_at);
    `);
  } catch (ddlErr) {
    console.error("DDL setup notice:", ddlErr);
  }

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASSED: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${name} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  // --- Section 1: Secret Redaction & Payload Sanitization ---
  console.log("\n--- Section 1: Secret Redaction & Payload Sanitization ---");
  {
    const rawPayload = {
      apiKey: "AIzaSyD1234567890abcdef-secret",
      bearerToken: "Bearer sk-ant-api03-abcdef1234567890",
      userPassword: "supersecretpassword123",
      nested: {
        dbSecret: "postgresql://user:pass@db.supabase.co:5432/db",
        normalField: "Regular execution text",
      },
    };

    const sanitized = sanitizePayload(rawPayload);
    assert(sanitized.apiKey === "[REDACTED_SECRET]", "Redact apiKey field in payload");
    assert(!JSON.stringify(sanitized).includes("sk-ant-api03"), "Redact Bearer token from payload");
    assert(sanitized.userPassword === "[REDACTED_SECRET]", "Redact userPassword field in payload");
    assert(!JSON.stringify(sanitized).includes("pass@db"), "Redact nested DB password in payload");
    assert(sanitized.nested.normalField === "Regular execution text", "Preserve non-secret fields");
  }

  // Set up test fixtures
  console.log("\n--- Setting Up Test Fixtures ---");
  const testOrgA = crypto.randomUUID();
  const testOrgB = crypto.randomUUID();
  const testUserA = crypto.randomUUID();
  const testUserB = crypto.randomUUID();
  let testProjectA: string | null = null;
  let testProjectB: string | null = null;

  try {
    await db.insert(users).values([
      { id: testUserA, email: `user-a-p8-${Date.now()}@example.com`, role: "user" },
      { id: testUserB, email: `user-b-p8-${Date.now()}@example.com`, role: "user" },
    ]);

    await db.insert(organizations).values([
      { id: testOrgA, name: "Phase 8 Test Org A" },
      { id: testOrgB, name: "Phase 8 Test Org B" },
    ]);

    const [projA] = await db.insert(projects).values({
      name: "Execution Project Alpha",
      organizationId: testOrgA,
      userId: testUserA,
    }).returning();
    testProjectA = projA.id;

    const [projB] = await db.insert(projects).values({
      name: "Execution Project Beta",
      organizationId: testOrgB,
      userId: testUserB,
    }).returning();
    testProjectB = projB.id;

    console.log(`  ✓ Test Fixtures Created: OrgA (${testOrgA}), OrgB (${testOrgB}), ProjA (${testProjectA}), ProjB (${testProjectB})`);

    // --- Section 2: Execution Creation & Persistence ---
    console.log("\n--- Section 2: Execution Creation & Persistence ---");
    let execId1: string | null = null;
    {
      const created = await createExecution({
        projectId: testProjectA,
        organizationId: testOrgA,
        userId: testUserA,
        agentType: "business_agent",
        title: "Catalog Inspection Run",
        status: "RUNNING",
        inputPayload: { action: "crawl_catalog", maxPages: 5, secretKey: "AIzaSyD-secret-123" },
      });

      assert(created !== null, "Create persistent execution record");
      assert(created?.status === "RUNNING", "Verify status set to RUNNING");
      assert(created?.inputPayload.secretKey === "[REDACTED_SECRET]", "Verify input payload sanitized on creation");
      execId1 = created?.id || null;
    }

    // --- Section 3: Lifecycle State Transitions ---
    console.log("\n--- Section 3: Lifecycle State Transitions ---");
    {
      const fetched = await getExecutionById(testProjectA, testOrgA, execId1!);
      assert(fetched !== null && fetched.id === execId1, "Retrieve execution run by ID");
      assert(fetched?.startedAt !== null, "Verify startedAt timestamp populated for RUNNING status");
    }

    // --- Section 4: Safe Cancellation ---
    console.log("\n--- Section 4: Safe Cancellation ---");
    let cancelExecId: string | null = null;
    {
      const toCancel = await createExecution({
        projectId: testProjectA,
        organizationId: testOrgA,
        title: "Long Running Web Scraper",
        status: "RUNNING",
      });
      cancelExecId = toCancel!.id;

      const cancelRes = await cancelExecution(testProjectA, testOrgA, cancelExecId, "User clicked stop");
      assert(cancelRes.success === true, "Cancel active execution run");
      assert(cancelRes.execution?.status === "CANCELLED", "Verify status updated to CANCELLED");
      assert(cancelRes.execution?.error === "User clicked stop", "Verify cancellation reason stored");
      assert(isExecutionCancelled(cancelExecId) === true, "Verify active cancellation registry updated");

      // Attempt second cancellation on already cancelled run
      const repeatCancel = await cancelExecution(testProjectA, testOrgA, cancelExecId, "Cancel again");
      assert(repeatCancel.success === false, "Second cancellation on already CANCELLED run is rejected");
      assert(repeatCancel.code === 400, "Verify HTTP 400 code returned for invalid state transition");
    }

    // --- Section 5: Safe Retries & Retry Limits ---
    console.log("\n--- Section 5: Safe Retries & Retry Limits ---");
    {
      const retryRes = await retryExecution(testProjectA, testOrgA, cancelExecId!);
      assert(retryRes.success === true, "Retry CANCELLED execution run");
      assert(retryRes.execution?.status === "RUNNING", "Status updated to RUNNING upon retry");
      assert(retryRes.execution?.retryCount === 1, "Retry count incremented to 1");
      assert(isExecutionCancelled(cancelExecId!) === false, "Verify active cancellation cleared upon retry");

      // Force retry count to max (3) and attempt another retry
      await db.update(agentExecutions)
        .set({ status: "FAILED", retryCount: 3, maxRetries: 3 })
        .where(eq(agentExecutions.id, cancelExecId!));

      const maxRetryRes = await retryExecution(testProjectA, testOrgA, cancelExecId!);
      assert(maxRetryRes.success === false, "Retry rejected when maxRetries limit reached");
    }

    // --- Section 6: Approval Enforcement & Token Validation ---
    console.log("\n--- Section 6: Approval Enforcement & Token Validation ---");
    {
      const approvalToken = "token-secret-99999";
      const pendingExec = await createExecution({
        projectId: testProjectA,
        organizationId: testOrgA,
        title: "High Risk Database Cleanup",
        status: "PENDING_APPROVAL",
        approvalToken,
      });

      assert(pendingExec?.status === "PENDING_APPROVAL", "Create run in PENDING_APPROVAL status");

      // Attempt approval with wrong token
      const wrongTokenRes = await approveExecution(testProjectA, testOrgA, pendingExec!.id, "wrong-token");
      assert(wrongTokenRes.success === false, "Approval with wrong token rejected");
      assert(wrongTokenRes.code === 403, "Verify HTTP 403 returned for mismatched approval token");

      // Approve with correct token
      const correctApproval = await approveExecution(testProjectA, testOrgA, pendingExec!.id, approvalToken);
      assert(correctApproval.success === true, "Approval with correct token succeeds");
      assert(correctApproval.execution?.status === "RUNNING", "Status transitions to RUNNING post-approval");
    }

    // --- Section 7: Paginated Run History & Stats ---
    console.log("\n--- Section 7: Paginated Run History & Stats ---");
    {
      const listData = await getProjectExecutions({
        projectId: testProjectA,
        organizationId: testOrgA,
        limit: 10,
        offset: 0,
      });

      assert(listData.executions.length >= 3, "Retrieve paginated project executions list");
      assert(listData.totalCount >= 3, "Total count accurate in execution stats");
      assert(typeof listData.runningCount === "number", "Running count included in stats");
      assert(typeof listData.pendingApprovalCount === "number", "Pending approval count included in stats");
    }

    // --- Section 8: Cross-Tenant & IDOR Protection ---
    console.log("\n--- Section 8: Cross-Tenant & IDOR Protection ---");
    {
      // Org B attempts to query Org A's execution
      let crossTenantReadBlocked = false;
      try {
        await getProjectExecutions({
          projectId: testProjectA,
          organizationId: testOrgB,
        });
      } catch (err) {
        crossTenantReadBlocked = true;
      }
      assert(crossTenantReadBlocked, "Org B blocked from reading Org A's executions list");

      // Org B attempts to cancel Org A's execution
      const crossCancel = await cancelExecution(testProjectA, testOrgB, execId1!, "Malicious cancel");
      assert(crossCancel.success === false, "IDOR Protection: Org B cannot cancel Org A's execution");
    }

  } finally {
    console.log("\n--- Cleaning Up Test Fixtures ---");
    if (testProjectA) {
      await db.delete(agentExecutions).where(eq(agentExecutions.projectId, testProjectA));
      await db.delete(projects).where(eq(projects.id, testProjectA));
    }
    if (testProjectB) {
      await db.delete(agentExecutions).where(eq(agentExecutions.projectId, testProjectB));
      await db.delete(projects).where(eq(projects.id, testProjectB));
    }
    await db.delete(organizations).where(eq(organizations.id, testOrgA));
    await db.delete(organizations).where(eq(organizations.id, testOrgB));
    await db.delete(users).where(eq(users.id, testUserA));
    await db.delete(users).where(eq(users.id, testUserB));
    console.log("  ✓ Test Fixtures Cleaned Up Successfully");
  }

  console.log("\n================================================================================");
  console.log(`  PHASE 8 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase8Tests().catch((err) => {
  console.error("Phase 8 test execution failed:", err);
  process.exit(1);
});
