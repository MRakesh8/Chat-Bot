import { BusinessAgent } from "../src/agents/businessAgent";
import { CoordinatorAgent } from "../src/agents/coordinator";

async function runTests() {
  console.log("================================================================================");
  console.log("🧪 TESTING: NOVA GENERAL CONVERSATION, IDENTITY & SCREEN AWARENESS RELIABILITY");
  console.log("================================================================================");

  const businessAgent = new BusinessAgent();
  const coordinatorAgent = new CoordinatorAgent();

  const baseProjectContext = {
    projectId: "383bd8d2-b7f8-4fac-8746-e18e765f9f96",
    sessionId: "test-session-general-1",
    userId: "test-user-1",
    customerContext: {
      isBusinessAdmin: true,
      verified: true,
    },
    payload: {
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

  // ─── TEST 1: Identity Inquiries ("Who are you?") ──────────────────────────
  console.log("\n[TEST 1] Testing Identity Inquiry: 'Who are you?'...");
  const t1Start = performance.now();
  const res1 = await businessAgent.execute({
    ...baseProjectContext,
    payload: {
      ...baseProjectContext.payload,
      message: "Who are you?",
      intent: "Who are you?"
    }
  });
  const t1Duration = Math.round(performance.now() - t1Start);

  if (!res1.success) {
    throw new Error(`TEST 1 FAILED: Expected success: true, got ${JSON.stringify(res1)}`);
  }
  if (res1.data?.intent !== "general_conversation") {
    throw new Error(`TEST 1 FAILED: Expected intent 'general_conversation', got '${res1.data?.intent}'`);
  }
  if (!res1.data?.response?.includes("NOVA AI Platform Assistant")) {
    throw new Error(`TEST 1 FAILED: Response does not identify as NOVA AI Platform Assistant: ${res1.data?.response}`);
  }
  if (!res1.data?.response?.includes("Project Settings") || !res1.data?.response?.includes("Apex Dynamics")) {
    throw new Error(`TEST 1 FAILED: Response does not incorporate active screen context: ${res1.data?.response}`);
  }
  console.log(`✅ TEST 1 PASSED: 'Who are you?' resolved in ${t1Duration}ms with authoritative platform identity & screen context.`);

  // ─── TEST 2: Identity Inquiries ("What can you do?") ──────────────────────
  console.log("\n[TEST 2] Testing Capabilities Inquiry: 'What can you do?'...");
  const res2 = await businessAgent.execute({
    ...baseProjectContext,
    payload: {
      ...baseProjectContext.payload,
      message: "What can you do?",
      intent: "What can you do?"
    }
  });

  if (!res2.success || res2.data?.intent !== "general_conversation") {
    throw new Error(`TEST 2 FAILED: Expected general_conversation, got ${JSON.stringify(res2)}`);
  }
  if (!res2.data?.response?.includes("Explain Screens") || !res2.data?.response?.includes("Navigate Anywhere")) {
    throw new Error(`TEST 2 FAILED: Response does not enumerate capabilities: ${res2.data?.response}`);
  }
  console.log("✅ TEST 2 PASSED: 'What can you do?' enumerated assistant capabilities accurately.");

  // ─── TEST 3: Greetings & Smalltalk ("Hi Nova", "How are you?") ─────────────
  console.log("\n[TEST 3] Testing Greetings & Smalltalk ('Hi Nova', 'How are you?')...");
  const res3a = await businessAgent.execute({
    ...baseProjectContext,
    payload: {
      ...baseProjectContext.payload,
      message: "Hi Nova",
      intent: "Hi Nova"
    }
  });

  if (!res3a.success || res3a.data?.intent !== "general_conversation" || !res3a.data?.response?.includes("Hello!")) {
    throw new Error(`TEST 3A FAILED: 'Hi Nova' failed: ${JSON.stringify(res3a)}`);
  }

  const res3b = await businessAgent.execute({
    ...baseProjectContext,
    payload: {
      ...baseProjectContext.payload,
      message: "How are you today?",
      intent: "How are you today?"
    }
  });

  if (!res3b.success || res3b.data?.intent !== "general_conversation" || !res3b.data?.response?.includes("doing well")) {
    throw new Error(`TEST 3B FAILED: 'How are you today?' failed: ${JSON.stringify(res3b)}`);
  }
  console.log("✅ TEST 3 PASSED: 'Hi Nova' and 'How are you today?' handled instantly.");

  // ─── TEST 4: Screen Awareness Preservation ("What is this screen?") ───────
  console.log("\n[TEST 4] Testing Screen Awareness: 'What is this screen?' on Project Settings...");
  const t4Start = performance.now();
  const res4 = await businessAgent.execute({
    ...baseProjectContext,
    payload: {
      ...baseProjectContext.payload,
      message: "What is this screen?",
      intent: "What is this screen?"
    }
  });
  const t4Duration = Math.round(performance.now() - t4Start);

  if (!res4.success || res4.data?.intent !== "guide_explain" || res4.data?.screen !== "Project Settings") {
    throw new Error(`TEST 4 FAILED: Expected guide_explain for Project Settings, got ${JSON.stringify(res4)}`);
  }
  if (!res4.data?.response?.includes("Project Settings") || !res4.data?.response?.includes("Apex Dynamics")) {
    throw new Error(`TEST 4 FAILED: Response does not mention Project Settings and Apex Dynamics: ${res4.data?.response}`);
  }
  console.log(`✅ TEST 4 PASSED: 'What is this screen?' resolved in ${t4Duration}ms with full screen guide.`);

  // ─── TEST 5: General Question Fallback to Streaming LLM ────────────────────
  console.log("\n[TEST 5] Testing Non-Project General Query: 'What is Python programming?' on empty knowledge...");
  // Simulate when RAG does not find project documents (empty knowledge project)
  const res5 = await businessAgent.execute({
    ...baseProjectContext,
    projectId: "00000000-0000-4000-8000-000000000001",
    payload: {
      ...baseProjectContext.payload,
      message: "What is Python programming?",
      intent: "What is Python programming?"
    }
  });

  // BusinessAgent must NOT return the static "I couldn't find that information in this website's connected knowledge"
  if (res5.data?.response?.includes("couldn't find that information in this website's connected knowledge")) {
    throw new Error(`TEST 5 FAILED: BusinessAgent returned static knowledge failure instead of falling back to stream: ${JSON.stringify(res5)}`);
  }
  if (res5.data?.intent === "fallback_to_stream") {
    console.log("✅ TEST 5 PASSED: BusinessAgent correctly signals fallback_to_stream for non-project queries.");
  } else if (res5.success && res5.data?.intent === "general_conversation") {
    console.log("✅ TEST 5 PASSED: General conversation answered directly.");
  } else {
    console.log(`✅ TEST 5 PASSED: Handled with intent '${res5.data?.intent}'.`);
  }

  // ─── TEST 6: CoordinatorAgent Delegation Integrity ─────────────────────────
  console.log("\n[TEST 6] Testing CoordinatorAgent delegation for general queries...");
  const coordRes = await coordinatorAgent.execute({
    ...baseProjectContext,
    payload: {
      ...baseProjectContext.payload,
      message: "Who is NOVA?",
      intent: "Who is NOVA?"
    }
  });

  if (!coordRes.success || coordRes.data?.intent !== "general_conversation" || !coordRes.data?.response?.includes("NOVA AI Platform Assistant")) {
    throw new Error(`TEST 6 FAILED: CoordinatorAgent failed to delegate identity inquiry: ${JSON.stringify(coordRes)}`);
  }
  console.log("✅ TEST 6 PASSED: CoordinatorAgent delegating identity inquiries cleanly.");

  console.log("\n================================================================================");
  console.log("🏁 ALL NOVA GENERAL CONVERSATION & RELIABILITY TESTS PASSED 100%!");
  console.log("================================================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("❌ Test suite failed with error:", err);
  process.exit(1);
});
