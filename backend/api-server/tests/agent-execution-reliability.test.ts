import { BusinessAgent } from "../src/agents/businessAgent";
import { CoordinatorAgent } from "../src/agents/coordinator";
import { PlannerAgent, WorkflowStep } from "../src/agents/planner";
import { VerificationAgent } from "../src/agents/verification";
import { executeServerTool, validateToolSchema, idempotencyCache } from "../src/services/tool-execution";
import { providerRegistry } from "../src/services/integrations/provider-registry";
import { ShopifyProvider } from "../src/services/integrations/providers/shopify";
import {
  generateActionConfirmationToken,
  verifyActionConfirmationToken,
  evaluateActionRisk,
  requiresConfirmation
} from "../src/security/agentSafety";
import { activeCancellations } from "../src/services/execution-governance";
import {
  db,
  projects,
  users,
  organizations,
  organizationMembers,
  projectIntegrations,
  integrationTools,
  withBypassRLS,
  crypto
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

async function runAgentReliabilityTests() {
  console.log("================================================================");
  console.log("  NOVA AI AGENT EXECUTION & TOOL RELIABILITY TEST SUITE");
  console.log("================================================================\n");

  // Ensure Shopify provider is registered
  if (!providerRegistry.hasProvider("shopify")) {
    providerRegistry.register(new ShopifyProvider());
  }

  const planner = new PlannerAgent();
  const coordinator = new CoordinatorAgent();
  const businessAgent = new BusinessAgent();
  const verifier = new VerificationAgent();

  // Test Fixtures: Tenant A and Tenant B
  const orgA_Id = "00000000-0000-4000-8000-0000000000a1";
  const orgB_Id = "00000000-0000-4000-8000-0000000000b1";
  const userA_Id = "00000000-0000-4000-8000-0000000000a2";
  const userB_Id = "00000000-0000-4000-8000-0000000000b2";
  const projA_Id = "00000000-0000-4000-8000-0000000000a3";
  const projB_Id = "00000000-0000-4000-8000-0000000000b3";
  const integrationA_Id = "00000000-0000-4000-8000-0000000000a4";
  const toolGetProducts_Id = "00000000-0000-4000-8000-0000000000a5";
  const toolCreateProduct_Id = "00000000-0000-4000-8000-0000000000a6";
  const toolUpdateProduct_Id = "00000000-0000-4000-8000-0000000000a7";
  const toolCancelOrder_Id = "00000000-0000-4000-8000-0000000000a8";

  // Setup Database Test Fixtures
  await withBypassRLS(async (tx: any) => {
    // Orgs
    await tx.insert(organizations).values([
      { id: orgA_Id, name: "Tenant A Organization" },
      { id: orgB_Id, name: "Tenant B Organization" }
    ]).onConflictDoNothing();

    // Users
    await tx.insert(users).values([
      { id: userA_Id, email: "agent-test-a@example.com", role: "user" },
      { id: userB_Id, email: "agent-test-b@example.com", role: "user" }
    ]).onConflictDoNothing();

    // Org Memberships
    await tx.insert(organizationMembers).values([
      { organizationId: orgA_Id, userId: userA_Id, role: "owner" },
      { organizationId: orgB_Id, userId: userB_Id, role: "owner" }
    ]).onConflictDoNothing();

    // Projects
    await tx.insert(projects).values([
      { id: projA_Id, name: "Agent Test Project A", organizationId: orgA_Id, userId: userA_Id, isActive: true },
      { id: projB_Id, name: "Agent Test Project B", organizationId: orgB_Id, userId: userB_Id, isActive: true }
    ]).onConflictDoNothing();

    // Integration for Project A (Shopify)
    const encryptedShopifyCreds = crypto.encrypt(JSON.stringify({
      shop: "test-store.myshopify.com",
      accessToken: "shpat_test_mock_token_123"
    }));

    await tx.insert(projectIntegrations).values({
      id: integrationA_Id,
      projectId: projA_Id,
      provider: "shopify",
      status: "AUTHORIZED",
      encryptedCredentials: encryptedShopifyCreds
    }).onConflictDoNothing();

    // Registered tools for Project A
    await tx.insert(integrationTools).values([
      {
        id: toolGetProducts_Id,
        projectId: projA_Id,
        integrationId: integrationA_Id,
        actionName: "shopify_get_products",
        description: "Retrieve store products",
        riskLevel: "READ_ONLY",
        isEnabled: true,
        status: "EXECUTABLE",
        inputSchema: { type: "object", properties: { limit: { type: "number" } } }
      },
      {
        id: toolCreateProduct_Id,
        projectId: projA_Id,
        integrationId: integrationA_Id,
        actionName: "shopify_create_product",
        description: "Create a new product in store",
        riskLevel: "LOW_RISK_WRITE",
        isEnabled: true,
        status: "EXECUTABLE",
        inputSchema: { type: "object", required: ["title"], properties: { title: { type: "string" }, price: { type: "string" } } }
      },
      {
        id: toolUpdateProduct_Id,
        projectId: projA_Id,
        integrationId: integrationA_Id,
        actionName: "shopify_update_product",
        description: "Update existing product in store",
        riskLevel: "LOW_RISK_WRITE",
        isEnabled: true,
        status: "EXECUTABLE",
        inputSchema: { type: "object", required: ["productId"], properties: { productId: { type: "string" }, price: { type: "string" } } }
      },
      {
        id: toolCancelOrder_Id,
        projectId: projA_Id,
        integrationId: integrationA_Id,
        actionName: "shopify_cancel_order",
        description: "Cancel store order (Consequential)",
        riskLevel: "HIGH_RISK_WRITE",
        isEnabled: true,
        status: "EXECUTABLE",
        inputSchema: { type: "object", required: ["orderId"], properties: { orderId: { type: "string" } } }
      }
    ]).onConflictDoNothing();
  });

  // Mock provider execution deterministically for safe testing
  const shopifyProvider = providerRegistry.getProvider("shopify");
  const origExecuteTool = shopifyProvider.executeTool;

  shopifyProvider.executeTool = async (actionName: string, input: any, credentials: any) => {
    if (actionName === "shopify_get_products") {
      return {
        products: [
          { id: "prod_101", title: "Wireless Noise-Cancelling Headphones", price: "199.99" },
          { id: "prod_102", title: "Ergonomic Mechanical Keyboard", price: "129.99" }
        ]
      };
    }
    if (actionName === "shopify_create_product") {
      return {
        product: {
          id: "prod_999",
          title: input.title,
          price: input.price || "10.00",
          created_at: new Date().toISOString()
        }
      };
    }
    if (actionName === "shopify_update_product") {
      return {
        product: {
          id: input.productId,
          title: input.title || "Updated Title",
          price: input.price || "50.00",
          updated_at: new Date().toISOString()
        }
      };
    }
    if (actionName === "shopify_delete_product") {
      return { deleted: true, productId: input.productId };
    }
    if (actionName === "shopify_cancel_order") {
      return {
        order: {
          id: input.orderId,
          cancelled_at: new Date().toISOString(),
          cancel_reason: "customer_requested"
        }
      };
    }
    if (actionName === "transient_failing_tool") {
      throw new Error("ETIMEDOUT: Connection reset by peer");
    }
    return origExecuteTool.call(shopifyProvider, actionName, input, credentials);
  };

  try {
    // --------------------------------------------------------------------------
    // TEST SECTION 1: SCHEMA VALIDATION & INPUT ENFORCEMENT
    // --------------------------------------------------------------------------
    console.log("[Test Section 1] Schema Validation & Input Enforcement");

    const validRes = validateToolSchema(
      { type: "object", required: ["title"], properties: { title: { type: "string" } } },
      { title: "Super Widget" }
    );
    assert(validRes.valid === true, "Valid title input passes schema validation");

    const missingFieldRes = validateToolSchema(
      { type: "object", required: ["title"], properties: { title: { type: "string" } } },
      {}
    );
    assert(missingFieldRes.valid === false, "Missing required field 'title' is rejected");
    assert(missingFieldRes.error?.includes("Missing required field 'title'") === true, "Error message identifies missing field");

    const invalidTypeRes = validateToolSchema(
      { type: "object", properties: { price: { type: "number" } } },
      { price: "not_a_number" }
    );
    assert(invalidTypeRes.valid === false, "String where number expected is rejected by schema validator");

    const toolInvalidExec = await executeServerTool({
      projectId: projA_Id,
      orgId: orgA_Id,
      userId: userA_Id,
      actionName: "shopify_create_product",
      input: {} // Missing required title
    });
    assert(toolInvalidExec.success === false, "Tool execution rejects missing required parameters");
    assert(toolInvalidExec.status === "INVALID_INPUT", "Rejection reports status INVALID_INPUT");
    assert(toolInvalidExec.error?.includes("Missing required field 'title'") === true, "Error message details validation reason");

    // --------------------------------------------------------------------------
    // TEST SECTION 2: SUCCESSFUL SINGLE-STEP EXECUTION & VERIFICATION
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 2] Successful Single-Step Execution & Authoritative Verification");

    const singleExec = await executeServerTool({
      projectId: projA_Id,
      orgId: orgA_Id,
      userId: userA_Id,
      actionName: "shopify_get_products",
      input: { limit: 10 }
    });
    assert(singleExec.success === true, "READ_ONLY tool execution succeeds");
    assert(singleExec.status === "COMPLETED", "Tool reports COMPLETED status");
    assert(Array.isArray(singleExec.data?.products), "Tool returns product records array");
    assert(singleExec.verification?.verified === true, "VerificationAgent authoritatively verifies product list");
    assert(singleExec.verification?.status === "SUCCEEDED", "Verification status is SUCCEEDED");
    assert(singleExec.verification?.evidence?.recordsCount === 2, "Verification records exact record count evidence");

    // Single-step mutation with low risk (direct execution without confirmation)
    const updateExec = await executeServerTool({
      projectId: projA_Id,
      orgId: orgA_Id,
      userId: userA_Id,
      actionName: "shopify_update_product",
      input: { productId: "prod_101", price: "249.00" }
    });
    assert(updateExec.success === true, "LOW_RISK_WRITE tool execution succeeds directly");
    assert(updateExec.status === "COMPLETED", "Tool reports COMPLETED status");
    assert(updateExec.data?.product?.id === "prod_101", "Product updated with confirmed ID");
    assert(updateExec.verification?.verified === true, "Verification confirms product update with ID");
    assert(updateExec.verification?.evidence?.entityId === "prod_101", "Verification captures entity ID in evidence");

    // Consequential mutation (HIGH risk) pauses for confirmation then executes upon confirmation token
    const createPending = await executeServerTool({
      projectId: projA_Id,
      orgId: orgA_Id,
      userId: userA_Id,
      actionName: "shopify_create_product",
      input: { title: "Custom Smart Thermostat", price: "249.00" }
    });
    assert(createPending.status === "PENDING_CONFIRMATION", "Creation requires confirmation token");
    assert(typeof createPending.confirmationToken === "string", "Returns cryptographic confirmation token");

    const createConfirmed = await executeServerTool({
      projectId: projA_Id,
      orgId: orgA_Id,
      userId: userA_Id,
      actionName: "shopify_create_product",
      input: { title: "Custom Smart Thermostat", price: "249.00" },
      confirmationToken: createPending.confirmationToken
    });
    assert(createConfirmed.success === true, "Confirmed creation executes successfully");
    assert(createConfirmed.status === "COMPLETED", "Confirmed tool reports COMPLETED status");
    assert(createConfirmed.data?.product?.id === "prod_999", "Product created with confirmed ID");
    assert(createConfirmed.verification?.verified === true, "Verification confirms product creation with ID");
    assert(createConfirmed.verification?.evidence?.entityId === "prod_999", "Verification captures entity ID in evidence");

    // --------------------------------------------------------------------------
    // TEST SECTION 3: IDEMPOTENCY & DUPLICATE PREVENTION
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 3] Idempotency & Duplicate Action Prevention");

    const idempotencyKey = `idem_test_${Date.now()}`;
    idempotencyCache.clear();

    const initialCall = await executeServerTool({
      projectId: projA_Id,
      orgId: orgA_Id,
      userId: userA_Id,
      actionName: "shopify_update_product",
      input: { productId: "prod_101", price: "49.99" },
      idempotencyKey
    });
    assert(initialCall.success === true, "Initial tool call executes and completes");
    assert(!initialCall.isIdempotentReplay, "Initial tool call is not an idempotent replay");

    // Replay call with exact same idempotency key
    const replayCall = await executeServerTool({
      projectId: projA_Id,
      orgId: orgA_Id,
      userId: userA_Id,
      actionName: "shopify_update_product",
      input: { productId: "prod_101", price: "49.99" },
      idempotencyKey
    });
    assert(replayCall.success === true, "Replay tool call returns success");
    assert(replayCall.isIdempotentReplay === true, "Replay tool call is recognized as idempotent replay");
    assert(replayCall.data?.product?.id === initialCall.data?.product?.id, "Replay returns identical cached result without duplicate execution");

    // --------------------------------------------------------------------------
    // TEST SECTION 4: UNAVAILABLE TOOLS & MISSING INFORMATION PLANNING
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 4] Task Planning: Unavailable Tools & Missing Information");

    const availableCaps = await businessAgent.getProjectCapabilities(projA_Id);

    // Request for an unsupported / unconnected tool (e.g. Slack broadcast)
    const unsuppPlan = await planner.planWorkflow({
      intent: "Post a message to our company Slack channel announcing the new product",
      projectId: projA_Id,
      availableTools: availableCaps
    });
    assert(unsuppPlan.success === false, "Planner halts on unsupported tool");
    assert(unsuppPlan.status === "UNAVAILABLE_TOOL", "Planner status is UNAVAILABLE_TOOL");
    assert(unsuppPlan.reason?.includes("Slack") === true, "Reason accurately identifies missing tool");

    // Request with missing required parameters (e.g. update price without new price)
    const missingParamPlan = await planner.planWorkflow({
      intent: "Find product and update price",
      projectId: projA_Id,
      availableTools: availableCaps
    });
    assert(missingParamPlan.success === false, "Planner halts on missing essential information");
    assert(missingParamPlan.status === "MISSING_INFORMATION", "Planner status is MISSING_INFORMATION");
    assert(missingParamPlan.missingInformation?.includes("price") === true, "Planner identifies 'price' as missing");

    // Proportional Planning: Simple single-step query vs multi-step
    const simplePlan = await planner.planWorkflow({
      intent: "Show me all store products",
      projectId: projA_Id,
      availableTools: availableCaps
    });
    assert(simplePlan.success === true, "Simple request planned successfully");
    assert(simplePlan.isMultiStep === false, "Simple request produces single-step plan (proportional)");
    assert(simplePlan.steps.length === 1, "Plan contains exactly 1 step");

    // --------------------------------------------------------------------------
    // TEST SECTION 5: MULTI-STEP WORKFLOWS WITH DEPENDENCY RESOLUTION
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 5] Multi-Step Workflows with Dynamic Dependency Mapping");

    const multiStepPlan = await planner.planWorkflow({
      intent: "Find product in catalog and set price to $179.99",
      projectId: projA_Id,
      availableTools: availableCaps
    });
    assert(multiStepPlan.success === true, "Complex request planned successfully");
    assert(multiStepPlan.isMultiStep === true, "Complex request recognized as multi-step workflow");
    assert(multiStepPlan.steps.length === 2, "Workflow broken down into 2 ordered steps");
    assert(multiStepPlan.steps[0].actionType === "shopify_get_products", "Step 1 reads store products");
    assert(multiStepPlan.steps[1].actionType === "shopify_update_product", "Step 2 mutates product price");
    assert(multiStepPlan.steps[1].dependsOn?.[0] === "step_1", "Step 2 declares dependency on Step 1");
    assert(Boolean(multiStepPlan.steps[1].inputMapping?.productId), "Step 2 declares inputMapping for productId from Step 1");

    // Execute the multi-step workflow end-to-end via CoordinatorAgent
    const workflowRes = await coordinator.executeWorkflow(
      {
        projectId: projA_Id,
        userId: userA_Id,
        sessionId: "wf_session_test",
        payload: { executionId: "00000000-0000-4000-8000-0000000000e1" }
      },
      multiStepPlan.steps
    );
    assert(workflowRes.success === true, "Multi-step workflow executes to completion");
    assert(workflowRes.data?.status === "COMPLETED", "Workflow status is COMPLETED");
    assert(workflowRes.data?.completedCount === 2, "Both workflow steps executed successfully");
    assert(workflowRes.data?.verificationSummary?.allVerified === true, "All workflow steps authoritatively verified");

    // Verify input mapping dynamically resolved productId from step 1 into step 2 input
    const executedStep2 = workflowRes.data?.steps[1];
    assert(executedStep2.result?.product?.id === "prod_101", "Step 2 resolved productId 'prod_101' from Step 1 products array");
    assert(executedStep2.result?.product?.price === "179.99", "Step 2 updated price to $179.99");

    // --------------------------------------------------------------------------
    // TEST SECTION 6: CONSEQUENTIAL ACTIONS & APPROVAL GATES
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 6] Consequential Actions & Human Approval Gates");

    // Attempting consequential action without confirmation token must pause
    const highRiskStep: WorkflowStep = {
      stepId: "step_consequential_1",
      actionType: "shopify_cancel_order",
      description: "Cancel order #5544",
      input: { orderId: "5544" },
      riskLevel: "HIGH_RISK_WRITE",
      requiresConfirmation: true,
      status: "PENDING"
    };

    const pausedWorkflow = await coordinator.executeWorkflow(
      {
        projectId: projA_Id,
        userId: userA_Id,
        sessionId: "approval_test_session",
        payload: { executionId: "00000000-0000-4000-8000-0000000000e2" }
      },
      [highRiskStep]
    );

    assert(pausedWorkflow.success === true, "Coordinator safely pauses before consequential action");
    assert(pausedWorkflow.data?.status === "PENDING_CONFIRMATION", "Workflow reports status PENDING_CONFIRMATION");
    assert(pausedWorkflow.data?.requiresConfirmation === true, "Workflow flags requiresConfirmation: true");
    assert(typeof pausedWorkflow.data?.confirmationToken === "string", "Generates cryptographic confirmation token");
    assert(Boolean(pausedWorkflow.data?.stepToConfirm), "Includes specific step pending human approval");

    // Resuming with the valid confirmation token
    const resumeWorkflow = await coordinator.executeWorkflow(
      {
        projectId: projA_Id,
        userId: userA_Id,
        sessionId: "approval_test_session",
        payload: {
          executionId: "00000000-0000-4000-8000-0000000000e2",
          confirmationToken: pausedWorkflow.data?.confirmationToken
        }
      },
      [highRiskStep]
    );

    assert(resumeWorkflow.success === true, "Workflow resumes and executes after valid human confirmation");
    assert(resumeWorkflow.data?.status === "COMPLETED", "Resumed workflow completes");
    assert(resumeWorkflow.data?.steps[0]?.result?.order?.id === "5544", "Order 5544 cancellation confirmed");

    // Tampered confirmation token must be strictly rejected
    const tamperedStep: WorkflowStep = {
      ...highRiskStep,
      stepId: "step_consequential_tamper",
      status: "PENDING",
      result: undefined
    };

    const tamperedRes = await coordinator.executeWorkflow(
      {
        projectId: projA_Id,
        userId: userA_Id,
        sessionId: "approval_test_session",
        payload: {
          executionId: "00000000-0000-4000-8000-0000000000e2",
          confirmationToken: "tampered_invalid_token_12345"
        }
      },
      [tamperedStep]
    );
    assert(tamperedRes.data?.status === "PENDING_CONFIRMATION", "Tampered confirmation token rejected, execution remains paused");

    // --------------------------------------------------------------------------
    // TEST SECTION 7: WORKFLOW CANCELLATION & PARTIAL EXECUTION
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 7] In-Flight Cancellation & Safe Partial Execution");

    const cancelExecutionId = "00000000-0000-4000-8000-0000000000e3";
    activeCancellations.add(cancelExecutionId);

    const cancelledPlan: WorkflowStep[] = [
      {
        stepId: "step_c1",
        actionType: "shopify_get_products",
        description: "Read products",
        input: {},
        riskLevel: "READ_ONLY",
        requiresConfirmation: false,
        status: "PENDING"
      },
      {
        stepId: "step_c2",
        actionType: "shopify_create_product",
        description: "Create product",
        input: { title: "Never Created" },
        riskLevel: "LOW_RISK_WRITE",
        requiresConfirmation: false,
        status: "PENDING"
      }
    ];

    const cancelRes = await coordinator.executeWorkflow(
      {
        projectId: projA_Id,
        userId: userA_Id,
        sessionId: "cancel_test_session",
        payload: { executionId: cancelExecutionId }
      },
      cancelledPlan
    );

    assert(cancelRes.success === false, "Cancelled workflow does not report success");
    assert(cancelRes.data?.status === "CANCELLED", "Workflow reports status CANCELLED");
    assert(cancelRes.data?.steps[0]?.status === "SKIPPED", "Step 1 marked as SKIPPED due to cancellation");
    assert(cancelRes.data?.steps[1]?.status === "SKIPPED", "Step 2 marked as SKIPPED without executing side effects");

    activeCancellations.delete(cancelExecutionId);

    // --------------------------------------------------------------------------
    // TEST SECTION 8: RESULT VERIFICATION EDGE CASES (UNVERIFIED VS FAILED)
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 8] Authoritative Verification Edge Cases");

    // Tool returns empty data object without error -> MUST BE UNVERIFIED
    const emptyResult = verifier.verifySingleResult({
      toolExecuted: "shopify_custom_action",
      status: "success",
      data: {}
    });
    assert(emptyResult.verified === false, "Empty response without state proof is marked NOT verified");
    assert(emptyResult.status === "UNVERIFIED", "Verification status is UNVERIFIED (never assume success solely from absence of exception)");

    // Tool returns internal error payload -> MUST BE FAILED
    const internalErrorResult = verifier.verifySingleResult({
      toolExecuted: "shopify_create_product",
      status: "success",
      data: { error: "GraphQL mutation returned: SKU already in use" }
    });
    assert(internalErrorResult.verified === false, "Embedded error payload fails verification");
    assert(internalErrorResult.status === "FAILED", "Verification status is FAILED");

    // Aggregate verification across multiple steps
    const aggSummary = verifier.verifyWorkflow([
      { stepId: "s1", actionType: "shopify_get_products", status: "COMPLETED", result: { products: [{ id: 1 }] } },
      { stepId: "s2", actionType: "shopify_delete_product", status: "FAILED", error: "Permission denied" }
    ]);
    assert(aggSummary.allVerified === false, "Workflow with any failed step fails aggregate verification");
    assert(aggSummary.succeededCount === 1, "Aggregate accurately records 1 succeeded step");
    assert(aggSummary.failedCount === 1, "Aggregate accurately records 1 failed step");

    // --------------------------------------------------------------------------
    // TEST SECTION 9: CROSS-TENANT AUTHORIZATION & IDOR PREVENTION
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 9] Cross-Tenant Authorization & Customer IDOR Prevention");

    // Tenant B user attempts to execute tool registered on Project A
    const crossTenantExec = await executeServerTool({
      projectId: projA_Id,
      orgId: orgB_Id, // Wrong organization
      userId: userB_Id,
      actionName: "shopify_get_products",
      input: {}
    });
    assert(crossTenantExec.success === false, "Cross-tenant organization mismatch is blocked");
    assert(crossTenantExec.status === "FORBIDDEN", "Blocked with status FORBIDDEN");
    assert(crossTenantExec.error?.includes("Tenant isolation violation") === true, "Error message reports tenant isolation violation");

    // Customer IDOR violation: Verified customer attempts to specify another customer's ID in input
    const idorExec = await executeServerTool({
      projectId: projA_Id,
      orgId: orgA_Id,
      userId: userA_Id,
      actionName: "shopify_get_products",
      input: { customerId: "victim_customer_999" },
      customerContext: { customerId: "attacker_customer_111", verified: true, isBusinessAdmin: false }
    });
    assert(idorExec.success === false, "Customer IDOR violation is strictly blocked");
    assert(idorExec.status === "FORBIDDEN", "IDOR violation returns status FORBIDDEN");
    assert(idorExec.error?.includes("IDOR violation") === true, "Error message reports Customer IDOR violation");

    // --------------------------------------------------------------------------
    // TEST SECTION 10: END-TO-END BUSINESS AGENT PIPELINE INTEGRATION
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 10] End-to-End BusinessAgent Pipeline Integration");

    // Conversational query -> Zero tool, zero plan
    const convoRes = await businessAgent.execute({
      projectId: projA_Id,
      userId: userA_Id,
      sessionId: "b_session_1",
      payload: { message: "Hello! How are you today?" }
    });
    assert(convoRes.success === true, "General conversation handled successfully");
    assert(convoRes.data?.intent === "general_conversation", "Intent recognized as general_conversation");
    assert(!convoRes.data?.toolExecuted, "Zero tool executed for general conversation");

    // Direct multi-step request via BusinessAgent
    const agentMultiStepRes = await businessAgent.execute({
      projectId: projA_Id,
      userId: userA_Id,
      sessionId: "b_session_2",
      payload: { message: "Find product in catalog and set price to $149.00" }
    });
    assert(agentMultiStepRes.success === true, "BusinessAgent handles multi-step request end-to-end");
    assert(agentMultiStepRes.data?.status === "COMPLETED", "Multi-step workflow completes");
    assert(agentMultiStepRes.data?.completedCount === 2, "Both planned steps executed and reported");
    assert(agentMultiStepRes.data?.steps[1]?.result?.product?.price === "149.00", "Final price updated to $149.00");

    console.log("\n================================================================");
    console.log(`  AGENT RELIABILITY RESULTS: ${passedTests}/${totalTests} PASSED (0 FAILED)`);
    console.log("================================================================\n");

  } finally {
    // Restore original provider method
    shopifyProvider.executeTool = origExecuteTool;
  }
}

runAgentReliabilityTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
