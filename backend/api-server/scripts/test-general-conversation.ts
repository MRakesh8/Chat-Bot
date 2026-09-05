import { BusinessAgent } from "../src/agents/businessAgent";

async function runGeneralConversationTests() {
  console.log("=================================================");
  console.log("    GENERAL CONVERSATION & ROUTING TEST SUITE    ");
  console.log("=================================================\n");

  const businessAgent = new BusinessAgent();
  let passed = 0;
  let failed = 0;

  const generalPhrases = [
    "Hi",
    "Hello there",
    "Hey!",
    "Good morning",
    "Good night",
    "Thanks",
    "Thank you so much",
    "Bye",
    "How are you?",
    "Who are you?",
    "What can you do?",
    "Can you help me?"
  ];

  console.log("[SECTION 1] Testing General Conversation Greetings, Small Talk & Capability Queries...\n");

  for (const phrase of generalPhrases) {
    const res = await businessAgent.execute({
      projectId: "dummy_project_id",
      sessionId: "sess_123",
      payload: { message: phrase }
    });

    const intent = res.data?.intent;
    const response = res.data?.response;

    if (res.success && intent === "general_conversation" && response && typeof response === "string" && response.length > 0) {
      console.log(`✅ PASS: "${phrase}" -> Classified as general_conversation (Zero RAG, Zero Tool). Response: "${response.slice(0, 60)}..."`);
      passed++;
    } else {
      console.error(`❌ FAIL: "${phrase}" -> Expected general_conversation, got intent: ${intent}`);
      failed++;
    }
  }

  console.log("\n=================================================");
  console.log(`GENERAL CONVERSATION TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runGeneralConversationTests().catch(console.error);
