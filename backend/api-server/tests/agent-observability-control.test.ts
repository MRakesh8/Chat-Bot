import {
  createExecution,
  getProjectExecutions,
  getExecutionById,
  updateExecutionProgress,
  approveExecution,
  cancelExecution,
  retryExecution,
  activeCancellations,
} from "../src/services/execution-governance";
import {
  generateActionConfirmationToken,
  verifyActionConfirmationToken,
} from "../src/security/agentSafety";
import { getDemoExecutions } from "../src/routes/projects/executions";
import {
  db,
  projects,
  users,
  organizations,
  organizationMembers,
  agentExecutions,
  withBypassRLS,
} from "@workspace/db";
import { eq } from "drizzle-orm";

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASSED: ${testName}`);
  } else {
    console.error(`  ✗ FAILED: ${testName} ${detail ? `(${detail})` : ""}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runObservabilityControlTests() {
  console.log("================================================================");
  console.log("  NOVA AGENT CONTROL CENTER & OBSERVABILITY TEST SUITE");
  console.log("================================================================\n");

  const orgA_Id = "00000000-0000-4000-8000-000000000c01";
  const orgB_Id = "00000000-0000-4000-8000-000000000c02";
  const userA_Id = "00000000-0000-4000-8000-000000000c03";
  const userB_Id = "00000000-0000-4000-8000-000000000c04";
  const projA_Id = "00000000-0000-4000-8000-000000000c05";
  const projB_Id = "00000000-0000-4000-8000-000000000c06";

  try {
    // 0. Setup Database Test Fixtures
    await withBypassRLS(async (tx: any) => {
      // Clean previous test executions
      await tx.delete(agentExecutions).where(eq(agentExecutions.projectId, projA_Id));
      await tx.delete(agentExecutions).where(eq(agentExecutions.projectId, projB_Id));

      // Orgs
      await tx.insert(organizations).values([
        { id: orgA_Id, name: "Observability Tenant A Org" },
        { id: orgB_Id, name: "Observability Tenant B Org" },
      ]).onConflictDoNothing();

      // Users
      await tx.insert(users).values([
        { id: userA_Id, email: "obs-user-a@example.com", role: "user" },
        { id: userB_Id, email: "obs-user-b@example.com", role: "user" },
      ]).onConflictDoNothing();

      // Org Members
      await tx.insert(organizationMembers).values([
        { organizationId: orgA_Id, userId: userA_Id, role: "owner" },
        { organizationId: orgB_Id, userId: userB_Id, role: "owner" },
      ]).onConflictDoNothing();

      // Projects
      await tx.insert(projects).values([
        { id: projA_Id, name: "Obs Project A", organizationId: orgA_Id, userId: userA_Id, isActive: true },
        { id: projB_Id, name: "Obs Project B", organizationId: orgB_Id, userId: userB_Id, isActive: true },
      ]).onConflictDoNothing();
    });

    console.log("--- Section 1: Execution Creation & Multi-Step Telemetry ---");

    const exec1 = await createExecution({
      projectId: projA_Id,
      organizationId: orgA_Id,
      userId: userA_Id,
      agentType: "COORDINATOR",
      title: "Update Shopify Pricing Workflow",
      status: "RUNNING",
      inputPayload: { query: "Update price for product 123", amount: "49.99" },
    });

    assert(!!exec1 && !!exec1.id, "Creates execution record in database");
    assert(exec1?.status === "RUNNING", "Initial status is RUNNING");
    assert(exec1?.retryCount === 0 && exec1?.maxRetries === 3, "Retry count initialized with default limit");

    // Add multi-step telemetry with dependencies, risk level, and authoritative verification
    const stepsData = [
      {
        stepId: "step-1",
        name: "Shopify Product Verification",
        actionType: "shopify_get_product",
        description: "Retrieve product details to verify current pricing",
        status: "COMPLETED",
        durationMs: 342,
        riskLevel: "READ_ONLY" as const,
        verification: {
          verified: true,
          status: "SUCCEEDED" as const,
          evidence: { productId: "123", currentPrice: "39.99" },
          reason: "Product found and verified with Shopify Admin API",
        },
      },
      {
        stepId: "step-2",
        name: "Update Shopify Product Price",
        actionType: "shopify_update_product",
        description: "Update product 123 price to $49.99",
        status: "PENDING_APPROVAL",
        dependsOn: ["step-1"],
        inputMapping: { productId: "step-1.result.id" },
        riskLevel: "HIGH_RISK_WRITE" as const,
        requiresConfirmation: true,
      },
    ];

    const updatedExec1 = await updateExecutionProgress(
      projA_Id,
      orgA_Id,
      exec1!.id,
      {
        status: "PENDING_APPROVAL",
        steps: stepsData,
        approvalToken: "mock-crypto-token-12345",
        outputData: {
          actionType: "shopify_update_product",
          parameters: { productId: "123", price: "49.99" },
          requiresConfirmation: true,
        },
      }
    );

    assert(updatedExec1?.status === "PENDING_APPROVAL", "Execution status transitions to PENDING_APPROVAL");
    assert(updatedExec1?.steps?.length === 2, "Steps saved and preserved in execution record");
    assert(updatedExec1?.steps?.[0]?.verification?.status === "SUCCEEDED", "Authoritative verification status preserved on completed step");
    assert(updatedExec1?.steps?.[1]?.dependsOn?.[0] === "step-1", "Step dependency 'dependsOn' mapped correctly");
    assert(updatedExec1?.approvalToken === "mock-crypto-token-12345", "Approval token persisted for 1-click operator resumption");

    console.log("\n--- Section 2: Authoritative Verification Truthfulness ---");

    // Create a run where verification failed / unverified
    const execUnverified = await createExecution({
      projectId: projA_Id,
      organizationId: orgA_Id,
      userId: userA_Id,
      agentType: "BUSINESS",
      title: "Sync Catalog to External DB",
      status: "FAILED",
      inputPayload: { action: "sync_catalog" },
    });

    await updateExecutionProgress(
      projA_Id,
      orgA_Id,
      execUnverified!.id,
      {
        status: "FAILED",
        error: "Remote database timeout while verifying catalog state",
        steps: [
          {
            stepId: "step-1",
            name: "Push Catalog Batch",
            actionType: "external_sync",
            status: "COMPLETED",
            durationMs: 1200,
            riskLevel: "LOW_RISK_WRITE" as const,
            verification: {
              verified: false,
              status: "UNVERIFIED" as const,
              reason: "Upstream database did not confirm record receipt before timeout",
            },
          },
        ],
      }
    );

    const retrievedUnverified = await getExecutionById(projA_Id, orgA_Id, execUnverified!.id);
    assert(retrievedUnverified?.steps?.[0]?.verification?.status === "UNVERIFIED", "Unconfirmed state recorded strictly as UNVERIFIED (truth in verification)");
    assert(retrievedUnverified?.steps?.[0]?.verification?.verified === false, "verified flag is false when upstream confirmation is missing");

    console.log("\n--- Section 3: Observability Filtering & Search ---");

    // Create a 3rd completed execution
    const exec3 = await createExecution({
      projectId: projA_Id,
      organizationId: orgA_Id,
      userId: userA_Id,
      agentType: "COORDINATOR",
      title: "Inventory Stock Level Audit",
      status: "COMPLETED",
      inputPayload: { query: "audit stock" },
    });

    await updateExecutionProgress(
      projA_Id,
      orgA_Id,
      exec3!.id,
      {
        status: "COMPLETED",
        steps: [
          {
            stepId: "step-1",
            name: "Fetch Inventory Levels",
            actionType: "shopify_get_inventory",
            status: "COMPLETED",
            durationMs: 180,
            riskLevel: "READ_ONLY" as const,
            verification: {
              verified: true,
              status: "SUCCEEDED" as const,
              evidence: { itemsAudited: 42 },
            },
          },
        ],
      }
    );

    // Test status filter
    const pendingList = await getProjectExecutions({
      projectId: projA_Id,
      organizationId: orgA_Id,
      statusFilter: "PENDING_APPROVAL",
    });
    assert(pendingList.executions.length === 1, "Status filter 'PENDING_APPROVAL' returns exactly 1 run");
    assert(pendingList.executions[0].id === exec1!.id, "Filtered record matches pending execution ID");

    const completedList = await getProjectExecutions({
      projectId: projA_Id,
      organizationId: orgA_Id,
      statusFilter: "COMPLETED",
    });
    assert(completedList.executions.length === 1, "Status filter 'COMPLETED' returns exactly 1 run");
    assert(completedList.executions[0].id === exec3!.id, "Filtered record matches completed execution ID");

    // Test text search
    const searchResult = await getProjectExecutions({
      projectId: projA_Id,
      organizationId: orgA_Id,
      searchQuery: "Pricing",
    });
    assert(searchResult.executions.length === 1 && searchResult.executions[0].id === exec1!.id, "Search query 'Pricing' matches title");

    // Test tool name filter
    const toolFilterResult = await getProjectExecutions({
      projectId: projA_Id,
      organizationId: orgA_Id,
      toolName: "shopify_get_inventory",
    });
    assert(toolFilterResult.executions.length === 1 && toolFilterResult.executions[0].id === exec3!.id, "Tool name filter returns run containing target tool step");

    // Test Stats aggregation directly returned by getProjectExecutions
    const allExecs = await getProjectExecutions({ projectId: projA_Id, organizationId: orgA_Id });
    assert(allExecs.totalCount === 3, "Stats totalCount is exactly 3");
    assert(allExecs.pendingApprovalCount === 1, "Stats pendingApprovalCount is exactly 1");
    assert(allExecs.completedCount === 1, "Stats completedCount is exactly 1");
    assert(allExecs.failedCount === 1, "Stats failedCount is exactly 1");

    console.log("\n--- Section 4: Human Approval, Token Verification & Resumption ---");

    // Generate real HMAC token for exec1 action
    const hmacObj = generateActionConfirmationToken({
      userId: userA_Id,
      projectId: projA_Id,
      sessionId: "session-control-1",
      actionId: "act-001",
      actionType: "shopify_update_product",
      actionTarget: "123",
    });

    const isValid = await verifyActionConfirmationToken(hmacObj.token, {
      userId: userA_Id,
      projectId: projA_Id,
      sessionId: "session-control-1",
      actionId: "act-001",
      actionType: "shopify_update_product",
      actionTarget: "123",
    });
    assert(isValid, "HMAC token cryptographically validates with expected parameters");

    const isTampered = await verifyActionConfirmationToken(hmacObj.token, {
      userId: userA_Id,
      projectId: projA_Id,
      sessionId: "tampered-session",
      actionId: "act-001",
      actionType: "shopify_update_product",
      actionTarget: "123",
    });
    assert(!isTampered, "Tampered parameters fail HMAC verification");

    // Approve exec1
    const approveResult = await approveExecution(projA_Id, orgA_Id, exec1!.id, "mock-crypto-token-12345");
    assert(approveResult.success === true, "approveExecution succeeds for pending run with token");
    assert(approveResult.execution?.status === "RUNNING", "Approved execution transitions to RUNNING for processing");

    console.log("\n--- Section 5: Operator Cancellation & Active Signal ---");

    const execToCancel = await createExecution({
      projectId: projA_Id,
      organizationId: orgA_Id,
      userId: userA_Id,
      agentType: "COORDINATOR",
      title: "Bulk Customer Email Outreach",
      status: "RUNNING",
      inputPayload: { count: 500 },
    });

    const cancelResult = await cancelExecution(projA_Id, orgA_Id, execToCancel!.id, "Operator halted campaign due to outdated template");
    assert(cancelResult.success === true, "cancelExecution succeeds");
    assert(cancelResult.execution?.status === "CANCELLED", "Execution marked as CANCELLED");
    assert(cancelResult.execution?.error?.includes("Operator halted campaign"), "Cancellation reason recorded in error field");
    assert(activeCancellations.has(execToCancel!.id), "Active cancellation flag registered in in-memory set for running loops");

    // Verify cancellation of already completed run fails
    const cancelCompletedResult = await cancelExecution(projA_Id, orgA_Id, exec3!.id, "Try to cancel finished run");
    assert(cancelCompletedResult.success === false, "Cannot cancel already COMPLETED execution");

    console.log("\n--- Section 6: Retry Preconditions & Bound Enforcements ---");

    // Retry failed unverified run
    const retryResult = await retryExecution(projA_Id, orgA_Id, execUnverified!.id);
    assert(retryResult.success === true, "Failed run restarts into RUNNING state");
    assert(retryResult.execution?.status === "RUNNING", "Status is updated to RUNNING");
    assert(retryResult.execution?.retryCount === 1, "Retry count increments from 0 to 1");

    // Attempting to retry a RUNNING run fails
    const retryRunningResult = await retryExecution(projA_Id, orgA_Id, retryResult.execution!.id);
    assert(retryRunningResult.success === false, "Cannot retry a currently RUNNING execution");

    // Test maxRetries exhaustion guard
    await withBypassRLS(async () => {
      await db.update(agentExecutions)
        .set({ status: "FAILED", retryCount: 3, maxRetries: 3 })
        .where(eq(agentExecutions.id, execUnverified!.id));
    });

    const maxRetriesResult = await retryExecution(projA_Id, orgA_Id, execUnverified!.id);
    assert(maxRetriesResult.success === false && maxRetriesResult.error?.includes("Maximum retry"), "Execution rejects retry when retryCount >= maxRetries");

    console.log("\n--- Section 7: Multi-Tenant Isolation ---");

    // Create execution for Tenant B
    const execTenantB = await createExecution({
      projectId: projB_Id,
      organizationId: orgB_Id,
      userId: userB_Id,
      agentType: "COORDINATOR",
      title: "Tenant B Secret Operation",
      status: "COMPLETED",
      inputPayload: { confidential: true },
    });

    const tenantAExecutions = await getProjectExecutions({
      projectId: projA_Id,
      organizationId: orgA_Id,
    });
    const containsTenantB = tenantAExecutions.executions.some((e) => e.id === execTenantB!.id);
    assert(!containsTenantB, "Tenant A cannot list or observe executions belonging to Tenant B (Tenant IDOR defense)");

    // Tenant A accessing Tenant B execution by ID fails
    const crossTenantGet = await getExecutionById(projB_Id, orgA_Id, execTenantB!.id);
    assert(crossTenantGet === null, "Tenant A querying Tenant B execution returns null (Tenant Isolation)");

    const tenantBStats = await getProjectExecutions({ projectId: projB_Id, organizationId: orgB_Id });
    assert(tenantBStats.totalCount === 1, "Tenant B stats strictly scoped to Tenant B project ID");

    console.log("\n--- Section 8: Demo Sandbox Execution Telemetry ---");

    const demoData = getDemoExecutions();
    const demoRuns = demoData.executions;
    assert(demoRuns.length >= 3, "Demo executions generator provides at least 3 representative lifecycle runs");
    const demoWithSteps = demoRuns.find((d) => d.steps && d.steps.length > 1);
    assert(!!demoWithSteps, "Demo runs include multi-step workflows");
    assert(!!demoWithSteps?.steps[0].durationMs, "Demo steps include duration telemetry");
    assert(!!demoWithSteps?.steps[0].verification, "Demo steps include authoritative verification evidence");
    assert(demoRuns.some((d) => d.status === "PENDING_APPROVAL"), "Demo runs include PENDING_APPROVAL state for operator preview");

    console.log("\n================================================================");
    console.log(`  OBSERVABILITY TEST RESULTS: ${passedTests}/${totalTests} PASSED (100%)`);
    console.log("================================================================\n");

    // Cleanup test data
    await withBypassRLS(async (tx: any) => {
      await tx.delete(agentExecutions).where(eq(agentExecutions.projectId, projA_Id));
      await tx.delete(agentExecutions).where(eq(agentExecutions.projectId, projB_Id));
    });

    return { total: totalTests, passed: passedTests };
  } catch (err) {
    console.error("Test run failed with error:", err);
    throw err;
  }
}

runObservabilityControlTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
