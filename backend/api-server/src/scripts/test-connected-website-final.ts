import { db, projects, projectWidgetSettings, withBypassRLS } from "@workspace/db";
import { eq } from "drizzle-orm";
import { contextFuser, buildContextAwarePrompt } from "../services/context-engine";
import { GeminiAdapter } from "../services/ai-router/providers/gemini-adapter";

const TEST_PROJECT_ID = "098ec428-1f17-4d79-8705-5479a07dddaf";

async function runTest() {
  console.log("================================================================================");
  console.log("🌐 CONNECTED WEBSITE AI ANSWER QUALITY — LIVE VERIFICATION SUITE");
  console.log("================================================================================");

  const [project] = await withBypassRLS(async (tx: any) => {
    return await tx.select().from(projects).where(eq(projects.id, TEST_PROJECT_ID));
  });

  const [widgetSettings] = await withBypassRLS(async (tx: any) => {
    return await tx.select().from(projectWidgetSettings).where(eq(projectWidgetSettings.projectId, TEST_PROJECT_ID));
  });

  const adapter = new GeminiAdapter();
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";

  let handoffInfo = "";
  if (widgetSettings?.humanHandoffLinks) {
    const links = widgetSettings.humanHandoffLinks as Record<string, string>;
    const details = [];
    if (links.whatsapp) details.push(`WhatsApp: ${links.whatsapp}`);
    if (links.phone) details.push(`Phone Number: ${links.phone}`);
    if (links.email) details.push(`Email Address: ${links.email}`);
    if (links.telegram) details.push(`Telegram: ${links.telegram}`);
    if (details.length > 0) {
      handoffInfo = `\n\nCONTACT DETAILS (HUMAN HANDOFF):\n${details.join("\n")}\n`;
    }
  }

  const testQuestions = [
    { q: "Tell me about Rakesh", expected: ["developer", "rakesh"], label: "PROFILE" },
    { q: "What projects has he built?", expected: ["chatbot", "portfolio", "smart farm", "psychology"], label: "PROJECTS" },
    { q: "What skills does he have?", expected: ["react", "node", "typescript", "postgresql"], label: "SKILLS" },
    { q: "Tell me about this website", expected: ["portfolio", "rakesh", "services"], label: "WEBSITE" },
    { q: "How can I contact Rakesh?", expected: ["whatsapp", "phone", "email"], label: "CONTACT" },
    { q: "What is his private phone password?", expected: ["don't have", "not available", "cannot", "not provided"], label: "SECURITY/UNKNOWN" }
  ];

  console.log(`Testing Project: "${project.name}" (ID: ${TEST_PROJECT_ID})\n`);

  for (let i = 0; i < testQuestions.length; i++) {
    const item = testQuestions[i];
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`[TEST ${i + 1}] [${item.label}] Question: "${item.q}"`);

    // 1. Context Fuser
    const fusedContext = await contextFuser.fuse({
      userMessage: item.q,
      websiteContext: {
        url: "https://rakesh-portfolio.vercel.app",
        page: { title: "Rakesh M - Full Stack Developer", type: "portfolio" }
      } as any,
      projectId: TEST_PROJECT_ID,
      userId: project.userId,
      settings: { enabled: true, mistakeDetection: false, contextMemory: true } as any
    });

    console.log(`  ✓ Retrieval: ${fusedContext.knowledgeChunks?.length || 0} chunks retrieved (${fusedContext.kbContextString.length} chars)`);

    // 2. Prompt Builder
    const systemPrompt = buildContextAwarePrompt({
      project: project as any,
      fusedContext,
      settings: { enabled: true } as any,
      handoffInfo
    });

    // 3. Stream Response
    let streamedAnswer = "";
    try {
      const stream = adapter.generateChatStream({
        model: {
          provider: "gemini",
          modelId: "gemini-flash-latest",
          credential: { id: "default", apiKey, type: "system" }
        },
        messages: [
          { role: "user", content: systemPrompt },
          { role: "assistant", content: "Understood. I will act as the official AI assistant for this connected website, strictly answering using the provided knowledge base, website context, and project instructions." },
          { role: "user", content: item.q }
        ]
      });

      for await (const chunk of stream) {
        streamedAnswer += chunk.text;
      }
    } catch (err: any) {
      streamedAnswer = `ERROR: ${err.message}`;
    }

    console.log(`  🤖 Answer:\n  "${streamedAnswer.replace(/\n+/g, ' ').trim()}"`);

    const lowerAns = streamedAnswer.toLowerCase();
    const matches = item.expected.filter(k => lowerAns.includes(k.toLowerCase()));
    if (matches.length > 0) {
      console.log(`  ✅ PASSED (Matches: [${matches.join(", ")}])`);
    } else {
      console.log(`  ⚠️ Warning: missing keywords [${item.expected.join(", ")}]`);
    }

    await new Promise(r => setTimeout(r, 2500));
  }

  // 4. Multi-Turn Conversational Follow-up Chain
  console.log(`\n================================================================================`);
  console.log(`🗣️ TESTING MULTI-TURN CONVERSATIONAL CONTINUITY`);
  console.log(`================================================================================`);

  const history: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  const multiTurnFlow = [
    { q: "Tell me about Rakesh", expect: "developer" },
    { q: "What projects has he built?", expect: "chatbot" },
    { q: "Which one uses AI?", expect: "ai" },
    { q: "Tell me more about that one.", expect: "knowledge base" }
  ];

  for (let turn = 0; turn < multiTurnFlow.length; turn++) {
    const step = multiTurnFlow[turn];
    console.log(`\n[Turn ${turn + 1}] User: "${step.q}"`);

    const fusedContext = await contextFuser.fuse({
      userMessage: step.q,
      websiteContext: null,
      projectId: TEST_PROJECT_ID,
      userId: project.userId,
      settings: { enabled: true } as any,
      conversationHistory: history
    });

    const systemPrompt = buildContextAwarePrompt({
      project: project as any,
      fusedContext,
      settings: { enabled: true } as any,
      handoffInfo
    });

    const messages: any = [
      { role: "user", content: systemPrompt },
      { role: "assistant", content: "Understood. I will act as the official AI assistant for this connected website." },
      ...history,
      { role: "user", content: step.q }
    ];

    let answer = "";
    try {
      const stream = adapter.generateChatStream({
        model: {
          provider: "gemini",
          modelId: "gemini-flash-latest",
          credential: { id: "default", apiKey, type: "system" }
        },
        messages
      });

      for await (const chunk of stream) {
        answer += chunk.text;
      }
    } catch (err: any) {
      answer = `ERROR: ${err.message}`;
    }

    console.log(`  🤖 Assistant: "${answer.replace(/\n+/g, ' ').trim().slice(0, 200)}..."`);
    history.push({ role: "user", content: step.q });
    history.push({ role: "assistant", content: answer });

    if (answer.toLowerCase().includes(step.expect.toLowerCase())) {
      console.log(`  ✅ Turn ${turn + 1} Continuity Verified`);
    } else {
      console.log(`  ⚠️ Turn ${turn + 1} Notice: check context`);
    }

    await new Promise(r => setTimeout(r, 2500));
  }

  console.log(`\n================================================================================`);
  console.log(`🎉 COMPREHENSIVE LIVE VERIFICATION COMPLETE`);
  console.log(`================================================================================`);
  process.exit(0);
}

runTest().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
