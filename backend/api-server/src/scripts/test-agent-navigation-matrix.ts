import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import { BusinessAgent } from "../agents/businessAgent";
import { VerificationAgent } from "../agents/verification";

async function runNavigationMatrixTests() {
  console.log("================================================================================");
  console.log("🧪 TESTING AGENT CONTROL: CONTEXT-AWARE NAVIGATION & PROJECT AMBIGUITY MATRIX");
  console.log("================================================================================");

  const businessAgent = new BusinessAgent();
  const verificationAgent = new VerificationAgent();
  const demoProjectId = "00000000-0000-4000-8000-000000000000";
  const demoProjectName = "Apex Dynamics — Demo";

  const mockCrmProjectId = "11111111-2222-4000-8000-999999999999";
  const mockAuthorizedProjects = [
    { id: demoProjectId, name: demoProjectName },
    { id: mockCrmProjectId, name: "CRM websites" },
    { id: "22222222-3333-4000-8000-888888888888", name: "E-commerce Store" }
  ];

  // --------------------------------------------------------------------------------
  // TEST 1: Ambiguous Navigation Request (No Active Project) -> MUST ASK CLARIFICATION
  // --------------------------------------------------------------------------------
  console.log("\n[TEST 1] Ambiguous Navigation Request ('Go to Widget Studio' with no active project)...");
  const test1Res = await businessAgent.execute({
    projectId: demoProjectId,
    sessionId: "test-sess-1",
    userId: "test-user-1",
    payload: {
      message: "Go to Widget Studio",
      currentContext: {
        currentRoute: "/projects",
        currentScreen: "projects_list",
        currentProjectId: null,
        currentProjectName: null,
        authorizedProjects: mockAuthorizedProjects
      }
    }
  });

  if (
    test1Res.success &&
    test1Res.data?.intent === "clarification" &&
    test1Res.data?.response?.includes("Which project would you like to open Widget Studio for?")
  ) {
    console.log("✅ TEST 1 PASSED: Agent correctly asked clarification without guessing the project.");
    console.log(`   Response:\n"${test1Res.data.response}"`);
  } else {
    console.error("❌ TEST 1 FAILED:", test1Res);
    process.exit(1);
  }

  // --------------------------------------------------------------------------------
  // TEST 2: Context-Aware Navigation Request (Inside Active Project) -> DIRECT NAVIGATION
  // --------------------------------------------------------------------------------
  console.log("\n[TEST 2] Context-Aware Navigation Request ('Go to Widget Studio' inside CRM websites project)...");
  const test2Res = await businessAgent.execute({
    projectId: mockCrmProjectId,
    sessionId: "test-sess-2",
    userId: "test-user-1",
    payload: {
      message: "Go to Widget Studio",
      currentContext: {
        currentRoute: `/projects/${mockCrmProjectId}/edit?tab=overview`,
        currentScreen: "overview",
        currentProjectId: mockCrmProjectId,
        currentProjectName: "CRM websites",
        authorizedProjects: mockAuthorizedProjects
      }
    }
  });

  if (
    test2Res.success &&
    test2Res.data?.intent === "navigation" &&
    test2Res.data?.action?.type === "navigate" &&
    test2Res.data?.action?.route === `/projects/${mockCrmProjectId}/edit?tab=widget-studio` &&
    test2Res.data?.response === "Opened Widget Studio for CRM websites."
  ) {
    console.log("✅ TEST 2 PASSED: Agent used current project context without asking redundant questions.");
    console.log(`   Route: ${test2Res.data.action.route}`);
    console.log(`   Response: "${test2Res.data.response}"`);
  } else {
    console.error("❌ TEST 2 FAILED:", test2Res);
    process.exit(1);
  }

  // --------------------------------------------------------------------------------
  // TEST 3: Explicit Project Name Navigation ('Go to Widget Studio for CRM websites') -> DIRECT RESOLUTION
  // --------------------------------------------------------------------------------
  console.log("\n[TEST 3] Explicit Project Navigation ('Go to Widget Studio for CRM websites' on global route)...");
  const test3Res = await businessAgent.execute({
    projectId: demoProjectId,
    sessionId: "test-sess-3",
    userId: "test-user-1",
    payload: {
      message: "Go to Widget Studio for CRM websites",
      currentContext: {
        currentRoute: "/settings",
        currentScreen: "settings",
        currentProjectId: null,
        currentProjectName: null,
        authorizedProjects: mockAuthorizedProjects
      }
    }
  });

  if (
    test3Res.success &&
    test3Res.data?.intent === "navigation" &&
    test3Res.data?.action?.type === "navigate" &&
    test3Res.data?.action?.route === `/projects/${mockCrmProjectId}/edit?tab=widget-studio` &&
    test3Res.data?.response === "Opened Widget Studio for CRM websites."
  ) {
    console.log("✅ TEST 3 PASSED: Agent resolved explicit project name 'CRM websites' cleanly.");
    console.log(`   Route: ${test3Res.data.action.route}`);
    console.log(`   Response: "${test3Res.data.response}"`);
  } else {
    console.error("❌ TEST 3 FAILED:", test3Res);
    process.exit(1);
  }

  // --------------------------------------------------------------------------------
  // TEST 4: Global Non-Project Navigation ('Go to Settings')...
  // --------------------------------------------------------------------------------
  console.log("\n[TEST 4] Global Non-Project Navigation ('Go to Settings')...");
  const test4Res = await businessAgent.execute({
    projectId: demoProjectId,
    sessionId: "test-sess-4",
    userId: "test-user-1",
    payload: {
      message: "Go to Settings",
      currentContext: {
        currentRoute: "/projects",
        currentScreen: "projects_list",
        currentProjectId: null,
        authorizedProjects: mockAuthorizedProjects
      }
    }
  });

  if (
    test4Res.success &&
    test4Res.data?.intent === "navigation" &&
    test4Res.data?.action?.route === "/settings" &&
    test4Res.data?.response === "Opened Settings."
  ) {
    console.log("✅ TEST 4 PASSED: Non-project global route resolved directly.");
    console.log(`   Route: ${test4Res.data.action.route}`);
    console.log(`   Response: "${test4Res.data.response}"`);
  } else {
    console.error("❌ TEST 4 FAILED:", test4Res);
    process.exit(1);
  }

  // --------------------------------------------------------------------------------
  // TEST 5: Security & Route Verification Gate Test
  // --------------------------------------------------------------------------------
  console.log("\n[TEST 5] Security & Route Verification Gate...");
  const verCheck = await verificationAgent.execute({
    payload: {
      result: {
        action: {
          type: "navigate",
          route: `/projects/${mockCrmProjectId}/edit?tab=widget-studio`
        }
      }
    }
  });

  if (verCheck.success && verCheck.data?.verified === true) {
    console.log("✅ TEST 5 PASSED: VerificationAgent successfully validated target route.");
  } else {
    console.error("❌ TEST 5 FAILED:", verCheck);
    process.exit(1);
  }

  console.log("\n================================================================================");
  console.log("🏁 ALL 5 CONTEXT-AWARE NAVIGATION & PROJECT AMBIGUITY TESTS PASSED 100%!");
  console.log("================================================================================");
  process.exit(0);
}

runNavigationMatrixTests().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
