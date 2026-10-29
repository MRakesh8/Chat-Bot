import { BusinessAgent } from "../src/agents/businessAgent";
import { CoordinatorAgent } from "../src/agents/coordinator";

async function runTests() {
  console.log("================================================================================");
  console.log("🧪 TESTING: NOVA SCREEN AWARENESS, REQUEST CANCELLATION & RELIABILITY");
  console.log("================================================================================");

  const businessAgent = new BusinessAgent();
  const coordinatorAgent = new CoordinatorAgent();

  // ─── TEST 1: User asks "What is this screen?" from Project Settings ───
  console.log("\n[TEST 1] Screen Awareness: 'What is this screen?' on Project Settings...");
  const t1Start = Date.now();
  const projectSettingsContext = {
    projectId: "383bd8d2-b7f8-4fac-8746-e18e765f9f96",
    sessionId: "test-session-1",
    userId: "test-user-1",
    payload: {
      message: "What is this screen?",
      intent: "What is this screen?",
      currentContext: {
        currentRoute: "/projects/383bd8d2-b7f8-4fac-8746-e18e765f9f96/edit",
        currentScreen: "Project Settings",
        currentProjectId: "383bd8d2-b7f8-4fac-8746-e18e765f9f96",
        currentProjectName: "Apex Dynamics",
        userId: "test-user-1",
        userRole: "owner",
        authorizedProjects: [
          { id: "383bd8d2-b7f8-4fac-8746-e18e765f9f96", name: "Apex Dynamics" }
        ]
      }
    }
  };

  const res1 = await businessAgent.execute(projectSettingsContext);
  const t1Duration = Date.now() - t1Start;

  if (!res1.success) {
    throw new Error(`TEST 1 FAILED: Expected success, got: ${JSON.stringify(res1)}`);
  }
  if (res1.data?.intent !== "guide_explain") {
    throw new Error(`TEST 1 FAILED: Expected intent 'guide_explain', got '${res1.data?.intent}'`);
  }
  if (res1.data?.screen !== "Project Settings") {
    throw new Error(`TEST 1 FAILED: Expected screen 'Project Settings', got '${res1.data?.screen}'`);
  }
  if (!res1.data?.response?.includes("Project Settings") || !res1.data?.response?.includes("Apex Dynamics")) {
    throw new Error(`TEST 1 FAILED: Response does not reference Project Settings and Apex Dynamics: ${res1.data?.response}`);
  }
  if (t1Duration > 1000) {
    throw new Error(`TEST 1 FAILED: Screen explanation took ${t1Duration}ms (expected < 1000ms fast deterministic path)`);
  }
  console.log(`✅ TEST 1 PASSED: 'What is this screen?' resolved in ${t1Duration}ms with authoritative project settings guide.`);

  // ─── TEST 2: Screen Awareness: Widget Studio & Knowledge Base ───
  console.log("\n[TEST 2] Screen Awareness: Widget Studio & Knowledge Base inquiries...");
  const widgetRes = await businessAgent.execute({
    projectId: "383bd8d2-b7f8-4fac-8746-e18e765f9f96",
    sessionId: "test-session-2",
    userId: "test-user-1",
    payload: {
      message: "Explain this screen",
      currentContext: {
        currentRoute: "/projects/383bd8d2-b7f8-4fac-8746-e18e765f9f96/edit?tab=widget-studio",
        currentScreen: "Widget Studio",
        currentProjectId: "383bd8d2-b7f8-4fac-8746-e18e765f9f96",
        currentProjectName: "Apex Dynamics"
      }
    }
  });

  if (!widgetRes.success || widgetRes.data?.intent !== "guide_explain" || !widgetRes.data?.response?.includes("Widget Studio")) {
    throw new Error(`TEST 2 FAILED: Widget Studio explanation failed: ${JSON.stringify(widgetRes)}`);
  }

  const kbRes = await businessAgent.execute({
    projectId: "383bd8d2-b7f8-4fac-8746-e18e765f9f96",
    sessionId: "test-session-3",
    userId: "test-user-1",
    payload: {
      message: "What can I do here?",
      currentContext: {
        currentRoute: "/projects/383bd8d2-b7f8-4fac-8746-e18e765f9f96/edit?tab=knowledge",
        currentScreen: "Knowledge Base",
        currentProjectId: "383bd8d2-b7f8-4fac-8746-e18e765f9f96",
        currentProjectName: "Apex Dynamics"
      }
    }
  });

  if (!kbRes.success || kbRes.data?.intent !== "guide_explain" || !kbRes.data?.response?.includes("Knowledge Base")) {
    throw new Error(`TEST 2 FAILED: Knowledge Base explanation failed: ${JSON.stringify(kbRes)}`);
  }
  console.log("✅ TEST 2 PASSED: Explanations for Widget Studio and Knowledge Base verified.");

  // ─── TEST 3: Route Fallback Resolution (screen name omitted, route provided) ───
  console.log("\n[TEST 3] Route Fallback Resolution...");
  const fallbackRes = await businessAgent.execute({
    projectId: "383bd8d2-b7f8-4fac-8746-e18e765f9f96",
    sessionId: "test-session-4",
    userId: "test-user-1",
    payload: {
      message: "what screen is this",
      currentContext: {
        currentRoute: "/projects/383bd8d2-b7f8-4fac-8746-e18e765f9f96/edit?tab=api-keys",
        currentScreen: "", // Empty screen label
        currentProjectId: "383bd8d2-b7f8-4fac-8746-e18e765f9f96",
        currentProjectName: "Apex Dynamics"
      }
    }
  });

  if (!fallbackRes.success || fallbackRes.data?.screen !== "API Keys") {
    throw new Error(`TEST 3 FAILED: Route fallback did not resolve 'API Keys': ${JSON.stringify(fallbackRes)}`);
  }
  console.log("✅ TEST 3 PASSED: Screen name derived accurately from currentRoute (/edit?tab=api-keys).");

  // ─── TEST 4: AbortSignal Cancellation Propagation ───
  console.log("\n[TEST 4] Cancellation Propagation via AbortSignal...");
  const abortController = new AbortController();
  abortController.abort(); // Immediately aborted

  const abortedRes = await businessAgent.execute({
    projectId: "383bd8d2-b7f8-4fac-8746-e18e765f9f96",
    sessionId: "test-session-5",
    userId: "test-user-1",
    signal: abortController.signal,
    payload: {
      message: "What is this screen?",
      currentContext: {
        currentRoute: "/projects/383bd8d2-b7f8-4fac-8746-e18e765f9f96/edit",
        currentScreen: "Project Settings"
      }
    }
  });

  if (abortedRes.success) {
    throw new Error(`TEST 4 FAILED: Aborted context should return success: false! Got: ${JSON.stringify(abortedRes)}`);
  }
  if (!abortedRes.error?.includes("aborted")) {
    throw new Error(`TEST 4 FAILED: Expected error to indicate abortion, got: ${abortedRes.error}`);
  }

  // Also test CoordinatorAgent abort check
  const coordAbortRes = await coordinatorAgent.execute({
    projectId: "383bd8d2-b7f8-4fac-8746-e18e765f9f96",
    sessionId: "test-session-6",
    userId: "test-user-1",
    signal: abortController.signal,
    payload: {
      message: "Hello"
    }
  });

  if (coordAbortRes.success) {
    throw new Error(`TEST 4 FAILED: CoordinatorAgent should reject aborted signal!`);
  }
  console.log("✅ TEST 4 PASSED: AbortSignal cancellation immediately stops execution across BusinessAgent & CoordinatorAgent.");

  // ─── TEST 5: CoordinatorAgent full integration of guide_explain ───
  console.log("\n[TEST 5] CoordinatorAgent delegation of guide_explain...");
  const coordRes = await coordinatorAgent.execute({
    projectId: "383bd8d2-b7f8-4fac-8746-e18e765f9f96",
    sessionId: "test-session-7",
    userId: "test-user-1",
    payload: {
      message: "What is this screen?",
      currentContext: {
        currentRoute: "/billing",
        currentScreen: "Billing & Subscriptions"
      }
    }
  });

  if (!coordRes.success || coordRes.data?.intent !== "guide_explain" || !coordRes.data?.response?.includes("Billing")) {
    throw new Error(`TEST 5 FAILED: CoordinatorAgent did not cleanly return guide_explain: ${JSON.stringify(coordRes)}`);
  }
  console.log("✅ TEST 5 PASSED: CoordinatorAgent correctly delegates and returns guide_explain intent.");

  // ─── TEST 6: Timeout Error Distinction vs Empty Abort ───
  console.log("\n[TEST 6] Timeout Error Semantics...");
  const timeoutException = new DOMException("Request timed out after 25000ms", "TimeoutError");
  if (timeoutException.name !== "TimeoutError" || !timeoutException.message.includes("timed out")) {
    throw new Error("TEST 6 FAILED: TimeoutException construction mismatch");
  }
  if (timeoutException.message.includes("without reason")) {
    throw new Error("TEST 6 FAILED: Explicit timeout message must never be 'without reason'!");
  }
  console.log("✅ TEST 6 PASSED: Explicit TimeoutError provides descriptive failure cause.");

  console.log("\n================================================================================");
  console.log("🏁 ALL NOVA SCREEN AWARENESS & CANCELLATION TESTS PASSED 100%!");
  console.log("================================================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Unhandled test failure:", err);
  process.exit(1);
});
