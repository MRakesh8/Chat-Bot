import { db, projects, projectWidgetSettings, projectContextSettings, withBypassRLS } from "@workspace/db";
import { eq } from "drizzle-orm";
import { searchProjectKnowledge } from "../services/knowledge";
import { contextFuser, buildContextAwarePrompt } from "../services/context-engine";
import { ai } from "@workspace/integrations-gemini-ai";

const TEST_PROJECT_ID = "098ec428-1f17-4d79-8705-5479a07dddaf";

interface TestCase {
  category: string;
  question: string;
  expectedKeywords: string[];
  forbiddenPhrases: string[];
}

const EVALUATION_SUITE: TestCase[] = [
  // 1. PROFILE
  {
    category: "PROFILE",
    question: "Who is Rakesh?",
    expectedKeywords: ["Rakesh", "developer"],
    forbiddenPhrases: ["I am NOVA AI", "I don't have access to personal information", "customer support bot"]
  },
  {
    category: "PROFILE",
    question: "Tell me about Rakesh.",
    expectedKeywords: ["Rakesh", "developer"],
    forbiddenPhrases: ["I am NOVA AI", "I don't have access to personal information"]
  },
  {
    category: "PROFILE",
    question: "What is his education?",
    expectedKeywords: ["undergraduate", "IT", "information technology"],
    forbiddenPhrases: ["I don't know", "not available in knowledge base", "I cannot answer"]
  },
  {
    category: "PROFILE",
    question: "What are his skills?",
    expectedKeywords: ["React", "Node", "PostgreSQL", "web development", "JavaScript", "TypeScript"],
    forbiddenPhrases: ["I cannot access private customer information", "unauthenticated", "NOVA AI"]
  },

  // 2. PROJECTS
  {
    category: "PROJECTS",
    question: "What projects has he built?",
    expectedKeywords: ["AI Chatbot", "Portfolio", "Psychology", "Smart Farm"],
    forbiddenPhrases: ["unspecified 'he'", "I don't have the capability", "NOVA AI's business"]
  },
  {
    category: "PROJECTS",
    question: "Tell me about the AI chatbot project.",
    expectedKeywords: ["Chat", "Knowledge Base", "Lead", "AI"],
    forbiddenPhrases: ["Category:", "Tag:", "NOVA AI"]
  },
  {
    category: "PROJECTS",
    question: "Tell me about the psychology website.",
    expectedKeywords: ["Appointment", "psychology", "booking"],
    forbiddenPhrases: ["Category:", "Tag: None"]
  },
  {
    category: "PROJECTS",
    question: "Tell me about the smart farm project.",
    expectedKeywords: ["Agriculture", "farm", "crops", "IoT"],
    forbiddenPhrases: ["Category:", "Tag: None"]
  },

  // 3. SERVICES
  {
    category: "SERVICES",
    question: "What services does he offer?",
    expectedKeywords: ["Web Development", "AI Chatbots", "Custom Software", "API"],
    forbiddenPhrases: ["NOVA AI's AI Business Agent"]
  },
  {
    category: "SERVICES",
    question: "Does he build business websites?",
    expectedKeywords: ["Yes", "business websites", "development", "web"],
    forbiddenPhrases: ["I don't know", "I cannot access"]
  },
  {
    category: "SERVICES",
    question: "Does he provide API development?",
    expectedKeywords: ["API", "development", "custom"],
    forbiddenPhrases: ["I don't know", "I cannot access"]
  },

  // 4. WEBSITE
  {
    category: "WEBSITE",
    question: "Tell me about this website.",
    expectedKeywords: ["Rakesh", "portfolio", "projects", "services"],
    forbiddenPhrases: ["NOVA internal", "system prompt", "database", "Gemini"]
  },

  // 5. CONTACT
  {
    category: "CONTACT",
    question: "How can I contact Rakesh?",
    expectedKeywords: ["WhatsApp", "Phone", "Email", "contact"],
    forbiddenPhrases: ["I don't have his contact details"]
  },
  {
    category: "CONTACT",
    question: "What is the preferred contact method?",
    expectedKeywords: ["WhatsApp", "contact"],
    forbiddenPhrases: ["I don't know"]
  },

  // 6. UNKNOWN / AMBIGUOUS
  {
    category: "UNKNOWN",
    question: "What is Rakesh's favorite food?",
    expectedKeywords: ["don't have", "not available", "not mentioned", "not specified"],
    forbiddenPhrases: ["favorite food is", "pizza", "burger", "pasta"]
  },
  {
    category: "UNKNOWN",
    question: "What is his private phone password?",
    expectedKeywords: ["don't have", "cannot", "not available", "not provided"],
    forbiddenPhrases: ["password is", "1234", "admin", "secret"]
  }
];

async function runEvaluation() {
  console.log("================================================================================");
  console.log("🧪 RUNNING COMPREHENSIVE AI ANSWER QUALITY & RAG PIPELINE EVALUATION");
  console.log("================================================================================");

  const [project] = await withBypassRLS(async (tx: any) => {
    return await tx.select().from(projects).where(eq(projects.id, TEST_PROJECT_ID));
  });

  const [settings] = await withBypassRLS(async (tx: any) => {
    return await tx.select().from(projectWidgetSettings).where(eq(projectWidgetSettings.projectId, TEST_PROJECT_ID));
  });

  console.log(`Loaded Project: "${project?.name}" (ID: ${TEST_PROJECT_ID})\n`);

  let totalTests = 0;
  let passedTests = 0;

  for (const tc of EVALUATION_SUITE) {
    totalTests++;
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`[TEST ${totalTests}] [${tc.category}] Question: "${tc.question}"`);

    // 1. Fuse Context with Knowledge Base
    const fusedContext = await contextFuser.fuse({
      userMessage: tc.question,
      websiteContext: {
        url: "https://rakesh-portfolio.vercel.app",
        page: { title: "Rakesh M - Full Stack Developer", type: "portfolio" }
      } as any,
      projectId: TEST_PROJECT_ID,
      userId: project.userId,
      settings: {
        enabled: true,
        mistakeDetection: false,
        contextMemory: true
      } as any
    });

    console.log(`  ✓ RAG Context Retrieved: ${fusedContext.kbContextString.length} chars (${fusedContext.knowledgeChunks?.length || 0} chunks)`);

    // 2. Build Context-Aware System Prompt
    const systemPrompt = buildContextAwarePrompt({
      project: project as any,
      fusedContext,
      settings: { enabled: true } as any
    });

    // 3. Generate Answer via LLM Pipeline
    const chatMessages = [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Understood. I will act as the official AI assistant for this connected website, strictly answering using the provided knowledge base, website context, and project instructions." }] },
      { role: "user", parts: [{ text: tc.question }] }
    ];

    let answer = "";
    try {
      const res = await ai.models.generateContent(project.userId, {
        contents: chatMessages as any
      });
      answer = res.text || "";
    } catch (e: any) {
      answer = `ERROR: ${e.message}`;
    }

    console.log(`  🤖 AI Answer:\n  "${answer.replace(/\n+/g, ' ')}"`);

    // 4. Assertions
    let passed = true;
    const lowerAns = answer.toLowerCase();

    // Check at least one expected keyword
    const matchedKeywords = tc.expectedKeywords.filter(k => lowerAns.includes(k.toLowerCase()));
    if (matchedKeywords.length === 0) {
      console.log(`  ❌ FAILED: Missing expected keywords. Expected one of [${tc.expectedKeywords.join(", ")}]`);
      passed = false;
    }

    // Check no forbidden phrases
    for (const fp of tc.forbiddenPhrases) {
      if (lowerAns.includes(fp.toLowerCase())) {
        console.log(`  ❌ FAILED: Contained forbidden phrase "${fp}"`);
        passed = false;
      }
    }

    if (passed) {
      console.log(`  ✅ PASSED (Matches keywords: [${matchedKeywords.join(", ")}], zero forbidden phrases)`);
      passedTests++;
    }

    // Pacing delay to avoid RPM rate-limiting
    await new Promise(r => setTimeout(r, 600));
  }

  // 7. MULTI-TURN CONVERSATIONAL TEST
  console.log(`\n================================================================================`);
  console.log(`🗣️ TESTING MULTI-TURN CONVERSATIONAL CONTINUITY & COREFERENCE`);
  console.log(`================================================================================`);

  const conversationHistory: Array<{ role: string; content: string }> = [];
  const multiTurnTurns = [
    { q: "Tell me about Rakesh.", expectKeywords: ["developer", "rakesh"] },
    { q: "What projects has he built?", expectKeywords: ["chatbot", "portfolio", "project"] },
    { q: "Which one uses AI?", expectKeywords: ["chatbot", "ai"] },
    { q: "Tell me more about that one.", expectKeywords: ["knowledge base", "lead", "business", "ai"] }
  ];

  let multiTurnPassed = 0;
  for (let i = 0; i < multiTurnTurns.length; i++) {
    const turn = multiTurnTurns[i];
    console.log(`\n[Turn ${i + 1}] User: "${turn.q}"`);

    const fusedContext = await contextFuser.fuse({
      userMessage: turn.q,
      websiteContext: null,
      projectId: TEST_PROJECT_ID,
      userId: project.userId,
      settings: { enabled: true } as any,
      conversationHistory
    });

    const systemPrompt = buildContextAwarePrompt({
      project: project as any,
      fusedContext,
      settings: { enabled: true } as any
    });

    const messages = [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Understood. I will act as the official AI assistant for this connected website." }] },
      ...conversationHistory.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      })),
      { role: "user", parts: [{ text: turn.q }] }
    ];

    const res = await ai.models.generateContent(project.userId, {
      contents: messages as any
    });

    const turnAnswer = res.text || "";
    console.log(`  🤖 AI Turn ${i + 1} Answer: "${turnAnswer.replace(/\n+/g, ' ').slice(0, 200)}..."`);

    conversationHistory.push({ role: "user", content: turn.q });
    conversationHistory.push({ role: "assistant", content: turnAnswer });

    const matched = turn.expectKeywords.some(k => turnAnswer.toLowerCase().includes(k.toLowerCase()));
    if (!matched) {
      console.log(`  ⚠️ Turn ${i + 1} warning: Missing expected keywords [${turn.expectKeywords.join(", ")}]`);
    } else {
      console.log(`  ✅ Turn ${i + 1} Continuity Verified`);
      multiTurnPassed++;
    }

    await new Promise(r => setTimeout(r, 600));
  }

  console.log(`\n================================================================================`);
  console.log(`📊 EVALUATION SUMMARY:`);
  console.log(`  - Single Turn Suite: ${passedTests} / ${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log(`  - Multi-Turn Chain: ${multiTurnPassed} / ${multiTurnTurns.length} Passed (${Math.round((multiTurnPassed / multiTurnTurns.length) * 100)}%)`);
  console.log(`================================================================================`);

  if (passedTests === totalTests && multiTurnPassed === multiTurnTurns.length) {
    console.log("🎉 ALL ANSWER QUALITY TESTS PASSED 100%!");
  }

  process.exit(passedTests === totalTests ? 0 : 1);
}

runEvaluation().catch(err => {
  console.error("Evaluation error:", err);
  process.exit(1);
});
