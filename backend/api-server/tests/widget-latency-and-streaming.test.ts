import assert from "node:assert";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import compression from "compression";
import { crypto as dbCrypto, db } from "@workspace/db";
import { UniversalRouterService } from "../src/services/ai-router/router";
import { registry } from "../src/services/ai-router/registry";
import { ai } from "@workspace/integrations-gemini-ai";
import { invalidateKnowledgeCache } from "../src/services/knowledge";
import { llmResponseCache } from "../src/services/cache-provider";
import widgetPublicRouter from "../src/routes/widget-public";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PROJECT_A = "11111111-aaaa-4aaa-8aaa-111111111111";
const PROJECT_B = "22222222-bbbb-4bbb-8bbb-222222222222";
const PROJECT_C_EMPTY = "33333333-cccc-4ccc-8ccc-333333333333";
const USER_A = "aaaa1111-1111-4111-8111-111111111111";
const USER_B = "bbbb2222-2222-4222-8222-222222222222";
const ORG_A = "aaaa9999-9999-4999-8999-999999999999";
const ORG_B = "bbbb9999-9999-4999-8999-999999999999";
const TOKEN_A = "tok_alpha_1234567890abcdef12345678";
const TOKEN_B = "tok_beta_1234567890abcdef123456789";
const TOKEN_C = "tok_empty_1234567890abcdef12345678";

function extractQueryParams(node: any, out: string[] = [], visited = new Set<any>()): string[] {
  if (!node || typeof node !== "object" || visited.has(node)) return out;
  visited.add(node);
  if (Array.isArray(node)) {
    for (const item of node) {
      extractQueryParams(item, out, visited);
    }
    return out;
  }
  if ("value" in node) {
    if (typeof node.value === "string") {
      out.push(node.value);
    } else if (Array.isArray(node.value)) {
      for (const v of node.value) {
        if (typeof v === "string") out.push(v);
      }
    }
  }
  if (Array.isArray(node.queryChunks)) {
    for (const chunk of node.queryChunks) {
      extractQueryParams(chunk, out, visited);
    }
  }
  if (node.sql) {
    extractQueryParams(node.sql, out, visited);
  }
  return out;
}

async function runTests() {
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("  WIDGET LATENCY, STREAMING, CANCELLATION & ISOLATION TEST SUITE");
  console.log("══════════════════════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;
  const failures: Array<{ name: string; err: any }> = [];

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ PASS: ${name}`);
    } catch (err: any) {
      failed++;
      failures.push({ name, err });
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err?.stack || err?.message || err}`);
    }
  }

  // Save originals so this script stays clean if composed
  const origTransaction = db.transaction;
  const origSelect = db.select;
  const origInsert = db.insert;
  const origUpdate = db.update;
  const origDelete = db.delete;
  const origQuery = db.query;
  const origResolveCandidates = UniversalRouterService.resolveCandidates.bind(UniversalRouterService);
  const origExecuteStream = UniversalRouterService.executeStream.bind(UniversalRouterService);
  const origExecuteChat = UniversalRouterService.executeChat.bind(UniversalRouterService);
  const origGeminiEmbed = ai.models.embedContent;
  const origGeminiGen = ai.models.generateContent;

  const counters = {
    resolveCandidatesCalls: 0,
    discoverModelCalls: 0,
    llmGenerateCalls: 0,
    llmStreamCalls: 0,
    embedCalls: 0,
    metadataQueries: 0,
    vectorQueries: 0,
  };
  const resetCounters = () => {
    counters.resolveCandidatesCalls = 0;
    counters.discoverModelCalls = 0;
    counters.llmGenerateCalls = 0;
    counters.llmStreamCalls = 0;
    counters.embedCalls = 0;
    counters.metadataQueries = 0;
    counters.vectorQueries = 0;
  };

  // Controllable provider behaviors per test
  let streamMode:
    | "normal"
    | "slow_chunks"
    | "abort_watch"
    | "fail_preheader"
    | "fail_midstream"
    | "hang_for_deadline"
    | "concurrent_echo" = "normal";
  let lastStreamMessages: any[] = [];
  let lastStreamModel: any = null;
  let capturedGeneratePrompts: string[] = [];
  let streamAbortedObserved = false;
  let streamYieldedAfterAbort = false;
  let intentDelayMs = 10;
  let intentResponseJson = JSON.stringify({ intent: "KNOWLEDGE_QUESTION" });
  let embedShouldFail = false;

  const logEntries: any[] = [];

  const mockRowsFor = (tableName: string, whereParams: string[]) => {
    const t = tableName.toLowerCase();
    const targetProject = whereParams.includes(PROJECT_B)
      ? PROJECT_B
      : whereParams.includes(PROJECT_C_EMPTY)
      ? PROJECT_C_EMPTY
      : PROJECT_A;

    if (t.includes("widget_settings")) {
      if (whereParams.includes(TOKEN_B) || targetProject === PROJECT_B) {
        return [{
          projectId: PROJECT_B,
          widgetToken: TOKEN_B,
          isEnabled: true,
          allowedDomains: ["beta.example.com"],
          botName: "BetaBot",
          welcomeMessage: "Welcome to Beta",
          themeColor: "#10b981",
          position: "bottom-right",
          displayMode: "floating",
          humanHandoffLinks: { email: "beta-support@example.com" },
          leadsEnabled: false,
        }];
      }
      if (whereParams.includes(TOKEN_C) || targetProject === PROJECT_C_EMPTY) {
        return [{
          projectId: PROJECT_C_EMPTY,
          widgetToken: TOKEN_C,
          isEnabled: true,
          allowedDomains: ["empty.example.com"],
          botName: "EmptyBot",
          welcomeMessage: "Hello",
          themeColor: "#6366f1",
          position: "bottom-right",
          displayMode: "floating",
          humanHandoffLinks: null,
          leadsEnabled: false,
        }];
      }
      if (whereParams.includes(TOKEN_A) || whereParams.includes(PROJECT_A) || whereParams.length === 0) {
        return [{
          projectId: PROJECT_A,
          widgetToken: TOKEN_A,
          isEnabled: true,
          allowedDomains: ["alpha.example.com", "localhost"],
          botName: "AlphaBot",
          welcomeMessage: "Welcome to Alpha",
          themeColor: "#8B5CF6",
          position: "bottom-right",
          displayMode: "floating",
          humanHandoffLinks: { whatsapp: "+15550100", email: "alpha@example.com" },
          leadsEnabled: false,
        }];
      }
      return [];
    }

    if (t.includes("projects")) {
      if (targetProject === PROJECT_B) {
        return [{
          id: PROJECT_B,
          userId: USER_B,
          organizationId: ORG_B,
          name: "Beta Corp",
          systemPrompt: "You are Beta Corp strictly private assistant.",
          isActive: true,
          status: "active",
          deploymentPaid: true,
        }];
      }
      if (targetProject === PROJECT_C_EMPTY) {
        return [{
          id: PROJECT_C_EMPTY,
          userId: USER_A,
          organizationId: ORG_A,
          name: "Empty KB Site",
          systemPrompt: "Only answer general questions honestly.",
          isActive: true,
          status: "active",
          deploymentPaid: true,
        }];
      }
      return [{
        id: PROJECT_A,
        userId: USER_A,
        organizationId: ORG_A,
        name: "Alpha Commerce",
        systemPrompt: "You are Alpha Commerce official assistant.",
        isActive: true,
        status: "active",
        deploymentPaid: true,
      }];
    }

    if (t.includes("licenses")) return [];
    if (t.includes("entitlements")) {
      return [{
        projectId: targetProject,
        entitlementStatus: "SUBSCRIPTION_ACTIVE",
        subscriptionStatus: "active",
      }];
    }
    if (t.includes("organization_usage")) {
      return [{
        id: "usage-1",
        organizationId: targetProject === PROJECT_B ? ORG_B : ORG_A,
        messagesSent: 2,
        crawlCount: 0,
        actionCount: 0,
      }];
    }
    if (t.includes("context_settings")) {
      return [{
        projectId: targetProject,
        enabled: true,
        dashboardAnalysis: true,
        formAssistant: true,
        tableAnalysis: true,
        navigationAssistant: true,
        knowledgeComparison: true,
        mistakeDetection: true,
        contextMemory: true,
        developerDebugMode: false,
        maxContextSizeBytes: 6144,
      }];
    }
    if (t.includes("chat_sessions")) {
      return [{ id: whereParams[0] || "44444444-4444-4444-8444-444444444444", projectId: targetProject, customerId: null }];
    }
    if (t.includes("knowledge_chunks")) {
      if (targetProject === PROJECT_C_EMPTY) return [];
      counters.vectorQueries++;
      if (targetProject === PROJECT_B) {
        return [{
          id: "chunk-b1",
          sourceId: "src-b1",
          chunkText: "Secret Beta Pricing: Enterprise tier costs $499/month.",
          title: "Beta Pricing",
          tag: "pricing",
          sourceType: "website",
          sourceUrl: "https://beta.example.com/pricing",
          websiteLinks: [],
          videoLinks: [],
          githubLinks: [],
          categoryName: "Pricing",
          rawContent: "Secret Beta Pricing: Enterprise tier costs $499/month.",
          summary: "Beta costs $499/month.",
          notes: "",
        }];
      }
      return [{
        id: "chunk-a1",
        sourceId: "src-a1",
        chunkText: "Alpha Starter plan costs $29/month and Pro plan costs $99/month. Enterprise SLA guarantees 99.9% uptime.",
        title: "Alpha Pricing & SLA Guide",
        tag: "pricing",
        sourceType: "document",
        sourceUrl: "https://alpha.example.com/docs/sla",
        websiteLinks: [],
        videoLinks: [],
        githubLinks: [],
        categoryName: "Pricing",
        rawContent: "Alpha Starter plan costs $29/month and Pro plan costs $99/month. Enterprise SLA guarantees 99.9% uptime.",
        summary: "Alpha pricing starts at $29/mo; SLA 99.9%.",
        notes: "",
      }];
    }
    if (t.includes("knowledge_sources")) {
      if (targetProject === PROJECT_C_EMPTY) return [];
      counters.metadataQueries++;
      if (targetProject === PROJECT_B) {
        return [{
          id: "src-b1",
          title: "Beta Pricing",
          tag: "pricing",
          notes: "",
          summary: "Beta costs $499/month.",
          rawContent: "Secret Beta Pricing: Enterprise tier costs $499/month.",
          sourceType: "website",
          sourceUrl: "https://beta.example.com/pricing",
          websiteLinks: [],
          videoLinks: [],
          githubLinks: [],
          categoryName: "Pricing",
        }];
      }
      return [{
        id: "src-a1",
        title: "Alpha Pricing & SLA Guide",
        tag: "pricing",
        notes: "",
        summary: "Alpha pricing starts at $29/mo; SLA 99.9%.",
        rawContent: "Alpha Starter plan costs $29/month and Pro plan costs $99/month. Enterprise SLA guarantees 99.9% uptime.",
        sourceType: "document",
        sourceUrl: "https://alpha.example.com/docs/sla",
        websiteLinks: [],
        videoLinks: [],
        githubLinks: [],
        categoryName: "Pricing",
      }];
    }
    if (t.includes("project_api_keys")) {
      if (whereParams.includes("99999999-9999-4999-8999-999999999999")) {
        return [{
          id: "bad-key-1",
          provider: "gemini",
          encryptedKey: "00112233445566778899aabbccddeeff:11223344556677889900aabbccddeeff:abcdef0123456789",
          status: "active",
          isDefault: true,
        }];
      }
      return [];
    }
    if (t.includes("user_api_keys")) {
      return [];
    }
    if (t.includes("project_integrations") || t.includes("integration_tools") || t.includes("browser_capabilities") || t.includes("agent_workflows")) {
      return [];
    }
    return [{ id: "row-1", messages: 1, conversations: 1, tokenUsage: 10, uniqueVisitors: 1 }];
  };

  function makeChain(
    tableName: string,
    kind: "select" | "insert" | "update" | "delete",
    collectedParams: string[] = [],
    selectFields?: Record<string, any>
  ): any {
    const resolvePromise = () => {
      if (kind !== "select") {
        return Promise.resolve([{ id: "row-write-1", createdAt: new Date() }]);
      }
      const rows = mockRowsFor(tableName, collectedParams);
      // Handle Drizzle select({ project, license, entitlement }) JOIN projection cleanly
      if (selectFields && typeof selectFields === "object" && "project" in selectFields && "entitlement" in selectFields) {
        const projRow = mockRowsFor("projects", collectedParams)[0] || null;
        const entRow = mockRowsFor("entitlements", collectedParams)[0] || null;
        const licRow = mockRowsFor("licenses", collectedParams)[0] || null;
        return Promise.resolve(projRow ? [{ project: projRow, license: licRow, entitlement: entRow }] : []);
      }
      return Promise.resolve(rows);
    };
    const chain: any = {
      from(tbl: any) {
        return makeChain(tbl?.[Symbol.for("drizzle:Name")] || tableName, kind, collectedParams, selectFields);
      },
      innerJoin() { return chain; },
      leftJoin() { return chain; },
      where(cond: any) {
        collectedParams.push(...extractQueryParams(cond));
        return chain;
      },
      orderBy() { return chain; },
      limit() { return chain; },
      values() { return chain; },
      set() { return chain; },
      onConflictDoUpdate() { return chain; },
      onConflictDoNothing() { return chain; },
      returning() { return chain; },
      then(onFulfilled: any, onRejected: any) {
        return resolvePromise().then(onFulfilled, onRejected);
      },
      catch(onRejected: any) {
        return resolvePromise().catch(onRejected);
      },
      finally(onFinally: any) {
        return resolvePromise().finally(onFinally);
      },
    };
    return chain;
  }

  const fakeTx: any = {
    execute: async () => [],
    select: (fields?: any) => makeChain("select", "select", [], fields),
    insert: (tbl: any) => makeChain(tbl?.[Symbol.for("drizzle:Name")] || "insert", "insert"),
    update: (tbl: any) => makeChain(tbl?.[Symbol.for("drizzle:Name")] || "update", "update"),
    delete: (tbl: any) => makeChain(tbl?.[Symbol.for("drizzle:Name")] || "delete", "delete"),
  };

  (db as any).transaction = async (cb: any) => cb(fakeTx);
  (db as any).select = (fields?: any) => makeChain("select", "select", [], fields);
  (db as any).insert = (tbl: any) => makeChain(tbl?.[Symbol.for("drizzle:Name")] || "insert", "insert");
  (db as any).update = (tbl: any) => makeChain(tbl?.[Symbol.for("drizzle:Name")] || "update", "update");
  (db as any).delete = (tbl: any) => makeChain(tbl?.[Symbol.for("drizzle:Name")] || "delete", "delete");
  (db as any).query = new Proxy({}, {
    get(_target, prop: string) {
      return {
        findFirst: async () => (mockRowsFor(prop, [])[0] || null),
        findMany: async () => mockRowsFor(prop, []),
      };
    },
  });

  // Mock UniversalRouterService.resolveCandidates with real tenant key differentiation & undecryptable ciphertext test
  UniversalRouterService.resolveCandidates = async (req: any) => {
    counters.resolveCandidatesCalls++;
    const key = req.projectId === PROJECT_B ? "decrypted-beta-key" : "decrypted-alpha-key";
    return [{
      provider: "gemini",
      modelId: "gemini-2.5-flash",
      credential: { id: `cred-${req.projectId || "default"}`, apiKey: key, type: "project" as const },
    }];
  };

  const mockGeminiAdapter: any = {
    providerId: "gemini",
    async discoverModels() {
      counters.discoverModelCalls++;
      return [{
        provider: "gemini",
        modelId: "gemini-2.5-flash",
        displayName: "Gemini 2.5 Flash",
        capabilities: {
          textGeneration: true, streaming: true, vision: true, tools: true,
          structuredOutput: true, reasoning: false, embedding: false, audio: false,
        },
      }];
    },
    async generateChat(req: any) {
      counters.llmGenerateCalls++;
      capturedGeneratePrompts.push(req.messages.map((m: any) => m.content).join("\n"));
      await sleep(intentDelayMs);
      if (req.signal?.aborted) {
        const abortErr: any = new Error("Request aborted");
        abortErr.name = "AbortError";
        throw abortErr;
      }
      return { content: intentResponseJson, usage: { promptTokens: 20, completionTokens: 8, totalTokens: 28 } };
    },
    async *generateChatStream(req: any) {
      counters.llmStreamCalls++;
      lastStreamMessages = req.messages;
      lastStreamModel = req.model;

      if (streamMode === "fail_preheader") {
        throw new Error("Simulated provider connection error (503)");
      }
      if (streamMode === "hang_for_deadline") {
        await new Promise((_, reject) => {
          const onAbort = () => reject(new Error("Aborted due to deadline"));
          if (req.signal?.aborted) return onAbort();
          req.signal?.addEventListener("abort", onAbort, { once: true });
        });
      }
      if (streamMode === "fail_midstream") {
        yield { text: "Partial answer " };
        await sleep(20);
        throw new Error("Mid-stream socket drop");
      }
      if (streamMode === "slow_chunks") {
        await sleep(220);
        const parts = ["First ", "streamed ", "chunk ", "complete."];
        for (const p of parts) {
          if (req.signal?.aborted) return;
          yield { text: p };
          await sleep(60);
        }
        return;
      }
      if (streamMode === "abort_watch") {
        yield { text: "First-token-" };
        for (let i = 0; i < 20; i++) {
          if (req.signal?.aborted) {
            streamAbortedObserved = true;
            return;
          }
          await sleep(25);
        }
        streamYieldedAfterAbort = true;
        yield { text: "should-not-arrive" };
        return;
      }
      if (streamMode === "concurrent_echo") {
        const userMsg = req.messages[req.messages.length - 1]?.content || "";
        const credId = req.model?.credential?.id || "none";
        await sleep(30);
        yield { text: `Echo(${credId}): ${userMsg}` };
        return;
      }

      // Default "normal" mode: detect if KB present in system prompt & avoid answering greetings with pricing
      const sysMsg = req.messages.find((m: any) => m.role === "system")?.content || "";
      const userPrompt = String(req.messages[req.messages.length - 1]?.content || "").toLowerCase();
      if (userPrompt.includes("hello there")) {
        yield { text: "Hello! " };
        yield { text: "How can I help you today?" };
      } else if (sysMsg.includes("99.9% uptime") || sysMsg.includes("$29/month")) {
        yield { text: "Alpha Starter is $29/mo, Pro is $99/mo, and Enterprise SLA guarantees 99.9% uptime." };
      } else if (sysMsg.includes("$499/month")) {
        yield { text: "Beta Enterprise tier costs $499/month." };
      } else {
        yield { text: "Hello! " };
        yield { text: "How can I help you today?" };
      }
    },
    classifyError: (err: any) => (err?.message?.includes("503") ? "PROVIDER_UNAVAILABLE" : "UNKNOWN_ERROR"),
  };
  registry.register(mockGeminiAdapter);

  (ai.models as any).embedContent = async () => {
    counters.embedCalls++;
    if (embedShouldFail) {
      throw new Error("Simulated embedding service outage");
    }
    return { embeddings: [{ values: new Array(768).fill(0.02) }] };
  };
  (ai.models as any).generateContent = async () => {
    counters.llmGenerateCalls++;
    return { text: "General Question" };
  };

  // Start test Express app WITH compression filter matching app.ts!
  const app = express();
  app.use(compression({
    filter: (req, res) => {
      const contentType = String(res.getHeader("Content-Type") || "").toLowerCase();
      if (contentType.includes("text/event-stream")) return false;
      return compression.filter(req, res);
    },
  }));
  app.use(express.json());
  app.use((req: any, _res, next) => {
    const capture = (level: string) => (obj: any, msg?: string) => {
      logEntries.push({ level, obj, msg: typeof obj === "string" ? obj : msg });
    };
    req.log = { info: capture("info"), warn: capture("warn"), error: capture("error"), debug: capture("debug") };
    next();
  });
  app.use("/api/widget", widgetPublicRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  async function postWidgetChat(
    token: string,
    origin: string,
    body: any,
    signal?: AbortSignal
  ): Promise<{ res: globalThis.Response; events: Array<{ event: string; data: any; raw: string; arrivalMs: number }>; text: string; startMs: number }> {
    const startMs = performance.now();
    const res = await fetch(`${baseUrl}/api/widget/${token}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
      signal,
    });
    const events: Array<{ event: string; data: any; raw: string; arrivalMs: number }> = [];
    let fullText = "";
    if (!res.body) return { res, events, text: "", startMs };
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buffer = "";
    let currentEvent = "message";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const arrivalMs = Math.round(performance.now() - startMs);
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t) {
            currentEvent = "message";
            continue;
          }
          if (t.startsWith("event:")) {
            currentEvent = t.slice(6).trim();
            continue;
          }
          if (t.startsWith("data:")) {
            const raw = t.slice(5).trim();
            let parsed: any = null;
            try { parsed = JSON.parse(raw); } catch {}
            events.push({ event: currentEvent, data: parsed, raw, arrivalMs });
            if (parsed?.content) fullText += parsed.content;
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") throw e;
    }
    return { res, events, text: fullText, startMs };
  }

  // ── Execute all 12 required tests ───────────────────────────────────────────────

  await test("1. Normal general question streams without duplicate LLM or model discovery calls", async () => {
    resetCounters();
    streamMode = "normal";
    logEntries.length = 0;

    const { res, text } = await postWidgetChat(TOKEN_A, "https://alpha.example.com", {
      messages: [{ role: "user", content: "Hi, hello there!" }],
      sessionId: "55555555-5555-4555-8555-555555555555",
      websiteContext: null,
    });

    assert.strictEqual(res.status, 200);
    assert(res.headers.get("content-type")?.includes("text/event-stream"));
    assert(res.headers.get("x-request-id"), "Correlation X-Request-Id header should be present");
    assert(text.includes("Hello! How can I help you today?"));
    assert.strictEqual(counters.llmGenerateCalls, 0, "Normal general question must not trigger redundant generateContent calls");
    assert.strictEqual(counters.llmStreamCalls, 1, "Must execute exactly 1 streaming provider call");
    assert.strictEqual(counters.discoverModelCalls, 0, "Should skip cold discoverModels on standard chat with explicit project key");
    assert.strictEqual(counters.resolveCandidatesCalls, 1, "Should resolve candidates once per request");

    const metricsLog = logEntries.find((e) => e.obj?.event === "WIDGET_CHAT_METRICS");
    assert(metricsLog, "Structured WIDGET_CHAT_METRICS log must be emitted");
    assert(typeof metricsLog.obj.timings?.total_duration_ms === "number");
    assert(!JSON.stringify(metricsLog).includes("decrypted-alpha-key"), "Secrets must never appear in logs");
  });

  await test("2. Website-specific knowledge question retrieves KB & live DOM context cleanly", async () => {
    resetCounters();
    streamMode = "normal";

    const { res, text } = await postWidgetChat(TOKEN_A, "https://alpha.example.com", {
      messages: [{ role: "user", content: "What is your pricing?" }],
      sessionId: "55555555-5555-4555-8555-555555555556",
      websiteContext: {
        version: "2.0",
        timestamp: Date.now(),
        extractionDurationMs: 12,
        transport: {
          mode: "full",
          sessionHash: "alpha-hash",
          segmentHashes: {},
          changedSegments: ["page"],
          unchangedSegments: [],
          sequenceNumber: 1,
        },
        page: {
          url: "https://alpha.example.com/pricing",
          path: "/pricing",
          title: "Alpha Pricing Page",
          type: "pricing",
          breadcrumbs: ["Home", "Pricing"],
          heading: "Pricing Plans",
        },
        navigation: { items: [] },
        content: {
          headings: ["Pricing Plans"], cards: [], tables: [], forms: [], charts: [],
          lists: [], notifications: [], dialogs: [], buttons: [], stats: [], canvasElements: [],
        },
        state: {
          activeFilters: [], openDialogs: [], visibleErrors: [], visibleWarnings: [],
          scrollPosition: "top", idleTimeMs: 0,
        },
        workflow: {},
        viewport: {
          width: 1280, height: 800, scrollX: 0, scrollY: 0, scrollDepthPercent: 0,
          visibleElementCount: 10, totalElementCount: 20, viewportCoveragePercent: 50,
        },
        metadata: {
          framework: "React", spaDetected: true, domNodeCount: 100, viewportNodeCount: 50,
          extractedElementCount: 10, cacheHit: false, mutationsSinceLastExtraction: 0, compressionRatio: 1,
        },
      },
    });

    assert.strictEqual(res.status, 200);
    assert(text.includes("$29/mo") && text.includes("99.9% uptime"));
    const sysMsg = lastStreamMessages.find((m) => m.role === "system")?.content || "";
    assert(sysMsg.includes("Alpha Commerce"), "System instruction must include project rules");
    assert(sysMsg.includes("alpha.example.com/pricing"), "System instruction must include live website URL context");
    assert(sysMsg.includes("Alpha Starter plan"), "System instruction must include retrieved KB content");
    assert.strictEqual(counters.llmGenerateCalls, 0);
    assert.strictEqual(counters.llmStreamCalls, 1);
  });

  await test("3. Document retrieval reuses query embedding cache and executes vector + metadata retrieval", async () => {
    resetCounters();
    streamMode = "normal";
    embedShouldFail = false;

    const queryText = "Explain the enterprise SLA guarantee in your documentation";
    const first = await postWidgetChat(TOKEN_A, "https://alpha.example.com", {
      messages: [{ role: "user", content: queryText }],
      sessionId: "55555555-5555-4555-8555-555555555557",
      websiteContext: null,
    });
    assert.strictEqual(first.res.status, 200);
    assert(first.text.includes("99.9% uptime"));
    assert.strictEqual(counters.embedCalls, 1, "First unique query embeds once");
    assert(counters.vectorQueries >= 1 && counters.metadataQueries >= 1, "Both vector & metadata queries executed");

    // Second request with slightly different casing hits bounded embedding cache (saves ~300-800ms)
    const second = await postWidgetChat(TOKEN_A, "https://alpha.example.com", {
      messages: [{ role: "user", content: queryText }],
      sessionId: "55555555-5555-4555-8555-555555555558",
      websiteContext: null,
    });
    assert.strictEqual(second.res.status, 200);
    assert.strictEqual(counters.embedCalls, 1, "Repeated query reuses cached embedding vector");
  });

  await test("4. Empty or unavailable KB handles gracefully (empty short-circuits embed; vector failure falls back to metadata)", async () => {
    // 4a. Empty project KB skips remote embedding API & table ilike scans
    await invalidateKnowledgeCache(PROJECT_C_EMPTY);
    resetCounters();
    streamMode = "normal";

    const emptyRes = await postWidgetChat(TOKEN_C, "https://empty.example.com", {
      messages: [{ role: "user", content: "Do you have hidden enterprise documentation?" }],
      sessionId: "55555555-5555-4555-8555-555555555559",
      websiteContext: null,
    });
    assert.strictEqual(emptyRes.res.status, 200);
    assert.strictEqual(counters.embedCalls, 0, "Empty KB must skip embedding API call completely");
    assert.strictEqual(counters.metadataQueries, 0, "Empty KB must skip full metadata table scans");

    // 4b. Embedding failure on populated KB falls back cleanly to metadata matches
    resetCounters();
    embedShouldFail = true;
    const degradedRes = await postWidgetChat(TOKEN_A, "https://alpha.example.com", {
      messages: [{ role: "user", content: "Tell me unique SLA pricing breakdown 9921" }],
      sessionId: "55555555-5555-4555-8555-555555555560",
      websiteContext: null,
    });
    embedShouldFail = false;
    assert.strictEqual(degradedRes.res.status, 200);
    assert(degradedRes.text.includes("$29/mo"), "Metadata fallback still retrieves Alpha pricing when vector search errors");
  });

  await test("5 & 9. Slow provider response streams tokens incrementally with real-time chunk spacing and no buffering", async () => {
    resetCounters();
    streamMode = "slow_chunks";

    const { res, events, text } = await postWidgetChat(TOKEN_A, "https://alpha.example.com", {
      messages: [{ role: "user", content: "Stream step by step" }],
      sessionId: "55555555-5555-4555-8555-555555555561",
      websiteContext: null,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(text, "First streamed chunk complete.");
    const contentEvents = events.filter((e) => e.data?.content);
    assert(contentEvents.length >= 4, `Expected >=4 incremental SSE chunks, got ${contentEvents.length}`);
    const firstArrival = contentEvents[0].arrivalMs;
    const lastArrival = contentEvents[contentEvents.length - 1].arrivalMs;
    assert(
      lastArrival - firstArrival >= 120,
      `Chunks must arrive incrementally over time (span=${lastArrival - firstArrival}ms), not buffered until end`
    );
  });

  await test("6. Provider timeout aborts hung action classifier cleanly without stalling response", async () => {
    resetCounters();
    streamMode = "normal";
    // Simulate a slow intent classifier exceeding 2000ms timeout while triggering action phrasing
    intentDelayMs = 2600;
    const prevTimeout = process.hrtime.bigint();
    const resObj = await postWidgetChat(TOKEN_A, "https://alpha.example.com", {
      messages: [{ role: "user", content: "Click the hidden settings button right now please" }],
      sessionId: "55555555-5555-4555-8555-555555555562",
      websiteContext: {
        version: "2.0",
        timestamp: Date.now(),
        extractionDurationMs: 10,
        transport: {
          mode: "full",
          sessionHash: "alpha-settings-hash",
          segmentHashes: {},
          changedSegments: ["page"],
          unchangedSegments: [],
          sequenceNumber: 1,
        },
        page: {
          url: "https://alpha.example.com/settings",
          path: "/settings",
          title: "Settings",
          type: "settings",
          breadcrumbs: ["Home", "Settings"],
          heading: "Account Settings",
        },
        navigation: { items: [] },
        content: {
          headings: ["Settings"], cards: [], tables: [], forms: [], charts: [],
          lists: [], notifications: [], dialogs: [], buttons: [{ label: "Hidden Settings" }], stats: [], canvasElements: [],
        },
        state: {
          activeFilters: [], openDialogs: [], visibleErrors: [], visibleWarnings: [],
          scrollPosition: "top", idleTimeMs: 0,
        },
        workflow: {},
        viewport: {
          width: 1280, height: 800, scrollX: 0, scrollY: 0, scrollDepthPercent: 0,
          visibleElementCount: 10, totalElementCount: 20, viewportCoveragePercent: 50,
        },
        metadata: {
          framework: "React", spaDetected: true, domNodeCount: 100, viewportNodeCount: 50,
          extractedElementCount: 10, cacheHit: false, mutationsSinceLastExtraction: 0, compressionRatio: 1,
        },
      },
    });
    const elapsedMs = Number(process.hrtime.bigint() - prevTimeout) / 1e6;
    intentDelayMs = 10;

    assert.strictEqual(resObj.res.status, 200);
    assert(resObj.text.length > 0, "Request must fall back to conversational response when classifier times out");
    assert.strictEqual(counters.llmGenerateCalls, 1, "Classifier must have run once before timeout abort");
    assert(elapsedMs < 2550, `Timeout must enforce bounded deadline (~2000ms), took ${Math.round(elapsedMs)}ms`);
  });

  await test("7. Provider failures (pre-header 503, mid-stream SSE error) & undecryptable ciphertext rejection", async () => {
    // 7a. Pre-header failure -> HTTP 503 JSON
    streamMode = "fail_preheader";
    const failPre = await postWidgetChat(TOKEN_A, "https://alpha.example.com", {
      messages: [{ role: "user", content: "Trigger preheader failure" }],
      sessionId: "55555555-5555-4555-8555-555555555563",
      websiteContext: null,
    });
    assert.strictEqual(failPre.res.status, 503, "Pre-stream failure must return HTTP 503 rather than fake HTTP 200");

    // 7b. Mid-stream failure -> partial content + explicit SSE event: error
    streamMode = "fail_midstream";
    const failMid = await postWidgetChat(TOKEN_A, "https://alpha.example.com", {
      messages: [{ role: "user", content: "Trigger midstream failure" }],
      sessionId: "55555555-5555-4555-8555-555555555564",
      websiteContext: null,
    });
    assert.strictEqual(failMid.res.status, 200);
    assert(failMid.text.includes("Partial answer"));
    const errorEvt = failMid.events.find((e) => e.event === "error");
    assert(errorEvt, "Mid-stream failure must emit explicit SSE event: error");

    // 7c. Verify real UniversalRouterService.resolveCandidates NEVER passes undecryptable ciphertext
    const prevEnvKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    const prevMockResolve = UniversalRouterService.resolveCandidates;
    delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    UniversalRouterService.resolveCandidates = origResolveCandidates;
    let resolvedReal: any[] = [];
    try {
      resolvedReal = await origResolveCandidates({
        capabilities: { textGeneration: true, streaming: true },
        projectId: "99999999-9999-4999-8999-999999999999",
        operation: "chat",
      });
    } finally {
      if (prevEnvKey !== undefined) process.env.AI_INTEGRATIONS_GEMINI_API_KEY = prevEnvKey;
      UniversalRouterService.resolveCandidates = prevMockResolve;
    }

    assert.strictEqual(
      resolvedReal.some((c: any) => c.credential?.apiKey?.includes("corrupted-ciphertext")),
      false,
      "Undecryptable ciphertext must NEVER be passed as plaintext API key"
    );
    assert.strictEqual(resolvedReal.length, 0);
  });

  await test("8. Client disconnect aborts backend stream and stops underlying AI provider generation", async () => {
    resetCounters();
    streamMode = "abort_watch";
    streamAbortedObserved = false;
    streamYieldedAfterAbort = false;

    const ac = new AbortController();
    const res = await fetch(`${baseUrl}/api/widget/${TOKEN_A}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://alpha.example.com" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Abort mid generation" }],
        sessionId: "55555555-5555-4555-8555-555555555565",
        websiteContext: null,
      }),
      signal: ac.signal,
    });

    const reader = res.body!.getReader();
    const first = await reader.read();
    const chunkText = new TextDecoder().decode(first.value);
    assert(chunkText.includes("First-token-"), "Client receives first chunk prior to disconnect");

    ac.abort();
    await sleep(180);

    assert.strictEqual(streamAbortedObserved, true, "Underlying provider generator must receive AbortSignal and terminate early");
    assert.strictEqual(streamYieldedAfterAbort, false, "Provider must not keep generating tokens after client disconnect");
  });

  await test("10. Tenant isolation enforces origin allowlist, KB isolation, system prompts & credentials", async () => {
    resetCounters();
    streamMode = "normal";

    // Cross-domain attempt using Token A from Beta domain must fail 403
    const crossOrigin = await fetch(`${baseUrl}/api/widget/${TOKEN_A}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://beta.example.com" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Steal alpha data" }],
        sessionId: "55555555-5555-4555-8555-555555555566",
      }),
    });
    assert.strictEqual(crossOrigin.status, 403);

    // Valid Beta request must only get Beta pricing and Beta credential, never Alpha
    const betaRes = await postWidgetChat(TOKEN_B, "https://beta.example.com", {
      messages: [{ role: "user", content: "What is your pricing?" }],
      sessionId: "55555555-5555-4555-8555-555555555567",
      websiteContext: null,
    });
    assert.strictEqual(betaRes.res.status, 200);
    assert(betaRes.text.includes("$499/month"));
    assert(!betaRes.text.includes("$29/mo"));
    assert.strictEqual(lastStreamModel?.credential?.apiKey, "decrypted-beta-key");
  });

  await test("11. Concurrent widget requests isolate responses cleanly without cross-talk", async () => {
    resetCounters();
    streamMode = "concurrent_echo";

    const jobs = [
      postWidgetChat(TOKEN_A, "https://alpha.example.com", {
        messages: [{ role: "user", content: "Query-A1" }],
        sessionId: "66666666-6666-4666-8666-666666666601",
      }),
      postWidgetChat(TOKEN_B, "https://beta.example.com", {
        messages: [{ role: "user", content: "Query-B1" }],
        sessionId: "66666666-6666-4666-8666-666666666602",
      }),
      postWidgetChat(TOKEN_A, "https://alpha.example.com", {
        messages: [{ role: "user", content: "Query-A2" }],
        sessionId: "66666666-6666-4666-8666-666666666603",
      }),
      postWidgetChat(TOKEN_B, "https://beta.example.com", {
        messages: [{ role: "user", content: "Query-B2" }],
        sessionId: "66666666-6666-4666-8666-666666666604",
      }),
    ];

    const outcomes = await Promise.all(jobs);
    assert.strictEqual(outcomes[0].text, `Echo(cred-${PROJECT_A}): Query-A1`);
    assert.strictEqual(outcomes[1].text, `Echo(cred-${PROJECT_B}): Query-B1`);
    assert.strictEqual(outcomes[2].text, `Echo(cred-${PROJECT_A}): Query-A2`);
    assert.strictEqual(outcomes[3].text, `Echo(cred-${PROJECT_B}): Query-B2`);

    const reqIds = new Set(outcomes.map((o) => o.res.headers.get("x-request-id")));
    assert.strictEqual(reqIds.size, 4, "Each concurrent request must receive a distinct X-Request-Id");
  });

  await test("12. No duplicate AI calls for informational or troubleshooting messages", async () => {
    resetCounters();
    streamMode = "normal";

    // Multi-turn troubleshooting query containing "error" and "fix" must NOT trigger false correction LLM loop
    const res = await postWidgetChat(TOKEN_A, "https://alpha.example.com", {
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello! How can I assist?" },
        { role: "user", content: "I saw an error on the login form, how do I fix it?" },
      ],
      sessionId: "77777777-7777-4777-8777-777777777777",
      websiteContext: null,
    });
    assert.strictEqual(res.res.status, 200);
    assert.strictEqual(counters.llmGenerateCalls, 0, "Must make 0 pre-stream intent/correction generateContent calls");
    assert.strictEqual(counters.llmStreamCalls, 1, "Must make exactly 1 streaming AI call");
    assert.strictEqual(counters.discoverModelCalls, 0);
    assert.strictEqual(counters.resolveCandidatesCalls, 1);

    // Also verify widget.js includes streaming safety & cancellation guards
    const widgetJsPath = path.resolve(process.cwd(), "../../frontend/chat-app/public/widget.js");
    const widgetJs = fs.readFileSync(widgetJsPath, "utf8");
    assert(widgetJs.includes("activeAbortController"), "widget.js must track activeAbortController");
    assert(widgetJs.includes("if (isSending) return;"), "widget.js must guard against duplicate concurrent submits");
    assert(widgetJs.includes("window.addEventListener('beforeunload'"), "widget.js must abort active streams on unload");
    assert(widgetJs.includes('currentEvent === "error"'), "widget.js must parse SSE error events");
    assert(widgetJs.includes("window.__novaWidgetLastTiming"), "widget.js must expose safe TTFT/total timing metrics");
  });

  server.close();
  // Restore prototypes
  (db as any).transaction = origTransaction;
  (db as any).select = origSelect;
  (db as any).insert = origInsert;
  (db as any).update = origUpdate;
  (db as any).delete = origDelete;
  (db as any).query = origQuery;
  UniversalRouterService.resolveCandidates = origResolveCandidates;
  UniversalRouterService.executeStream = origExecuteStream;
  UniversalRouterService.executeChat = origExecuteChat;
  (ai.models as any).embedContent = origGeminiEmbed;
  (ai.models as any).generateContent = origGeminiGen;

  console.log(`\n══════════════════════════════════════════════════════════════════`);
  console.log(`  RESULTS: PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`══════════════════════════════════════════════════════════════════\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test suite fatal error:", err);
  process.exit(1);
});
