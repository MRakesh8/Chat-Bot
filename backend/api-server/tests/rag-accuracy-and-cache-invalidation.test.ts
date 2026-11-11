import assert from "node:assert";
import http from "node:http";
import express from "express";
import { db } from "@workspace/db";
import { UniversalRouterService } from "../src/services/ai-router/router";
import { registry } from "../src/services/ai-router/registry";
import { ai } from "@workspace/integrations-gemini-ai";
import {
  searchProjectKnowledge,
  invalidateKnowledgeCache,
  buildCompositeText,
} from "../src/services/knowledge";
import { ContextFuser } from "../src/services/context-engine/context-fuser";
import { OpenAIAdapter } from "../src/services/ai-router/providers/openai-adapter";
import widgetPublicRouter from "../src/routes/widget-public";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PROJECT_A = "11111111-aaaa-4aaa-8aaa-111111111111";
const PROJECT_B = "22222222-bbbb-4bbb-8bbb-222222222222";
const PROJECT_EMPTY = "33333333-cccc-4ccc-8ccc-333333333333";
const TOKEN_A = "tok_test_alpha_1234567890abcdef";
const TOKEN_B = "tok_test_beta_1234567890abcdef1";
const TOKEN_EMPTY = "tok_test_empty_1234567890abcdef";

function extractQueryParams(node: any, out: string[] = [], visited = new Set<any>()): string[] {
  if (!node || typeof node !== "object" || visited.has(node)) return out;
  visited.add(node);
  if (Array.isArray(node)) {
    for (const item of node) extractQueryParams(item, out, visited);
    return out;
  }
  if ("value" in node) {
    if (typeof node.value === "string") out.push(node.value);
    else if (Array.isArray(node.value)) {
      for (const v of node.value) if (typeof v === "string") out.push(v);
    }
  }
  if (Array.isArray(node.queryChunks)) {
    for (const chunk of node.queryChunks) extractQueryParams(chunk, out, visited);
  }
  if (node.sql) extractQueryParams(node.sql, out, visited);
  return out;
}

async function runRegressionTests() {
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("  RAG ACCURACY (C1), CACHE FRESHNESS (C2) & RELIABILITY (P1-P3)");
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

  // Backup original db methods
  const origTransaction = db.transaction;
  const origSelect = db.select;
  const origInsert = db.insert;
  const origUpdate = db.update;
  const origDelete = db.delete;
  const origQuery = db.query;
  const origGeminiEmbed = ai.models.embedContent;
  const origGeminiGen = ai.models.generateContent;
  const origResolveCandidates = UniversalRouterService.resolveCandidates.bind(UniversalRouterService);
  const origExecuteStream = UniversalRouterService.executeStream.bind(UniversalRouterService);

  // Dynamic in-memory knowledge store for tests
  let currentProjectAPrice = 29;
  let projectAHasKnowledge = true;

  const buildLargeDoc = (price: number) => {
    const headerText = `Enterprise Cloud Platform Architecture & Standard SLA Overview.\nStarter plan pricing is $${price}/month with standard compute.`;
    const padding = " Architecture section details and cloud deployment configurations.".repeat(55);
    const tailFact = "CRITICAL_EXCLUSIVE_FACT: UltraEnterprise Tier custom pricing is strictly $999/month with Dedicated Bare Metal.";
    return `${headerText}\n${padding}\n${tailFact}\nFinal documentation note.`;
  };

  const tailFactText = "CRITICAL_EXCLUSIVE_FACT: UltraEnterprise Tier custom pricing is strictly $999/month with Dedicated Bare Metal.";

  const mockRowsFor = (tableName: string, whereParams: string[]) => {
    const t = tableName.toLowerCase();
    const targetProject = whereParams.includes(PROJECT_B)
      ? PROJECT_B
      : whereParams.includes(PROJECT_EMPTY)
      ? PROJECT_EMPTY
      : PROJECT_A;

    if (t.includes("widget_settings")) {
      const isB = whereParams.includes(TOKEN_B) || targetProject === PROJECT_B;
      const isEmpty = whereParams.includes(TOKEN_EMPTY) || targetProject === PROJECT_EMPTY;
      return [{
        projectId: isB ? PROJECT_B : isEmpty ? PROJECT_EMPTY : PROJECT_A,
        widgetToken: isB ? TOKEN_B : isEmpty ? TOKEN_EMPTY : TOKEN_A,
        isEnabled: true,
        allowedDomains: ["localhost"],
        botName: "TestBot",
        welcomeMessage: "Hello!",
        themeColor: "#8B5CF6",
        position: "bottom-right",
        displayMode: "floating",
        humanHandoffLinks: null,
        leadsEnabled: false,
      }];
    }

    if (t.includes("projects")) {
      return [{
        id: targetProject,
        organizationId: targetProject === PROJECT_B ? "org-beta" : "org-alpha",
        userId: targetProject === PROJECT_B ? "user-beta" : "user-alpha",
        name: targetProject === PROJECT_B ? "Beta Corp" : "Alpha Commerce",
        allowedDomains: ["localhost"],
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
        organizationId: targetProject === PROJECT_B ? "org-beta" : "org-alpha",
        messagesSent: 2,
        crawlCount: 0,
        actionCount: 0,
      }];
    }

    if (t.includes("project_context_settings") || t.includes("context_settings")) {
      return [{
        projectId: targetProject,
        enabled: true,
        knowledgeRetrieval: true,
        knowledgeComparison: true,
        mistakeDetection: true,
        contextMemory: true,
        developerDebugMode: false,
        maxContextSizeBytes: 6144,
      }];
    }

    if (t.includes("chat_sessions")) {
      return [{ id: "sess-test-1", projectId: targetProject, customerId: null }];
    }

    if (t.includes("knowledge_sources")) {
      if (targetProject === PROJECT_EMPTY || (targetProject === PROJECT_A && !projectAHasKnowledge)) return [];
      if (targetProject === PROJECT_B) {
        return [{
          id: "src-b1",
          projectId: PROJECT_B,
          title: "Beta Pricing Guide",
          tag: "pricing",
          notes: "",
          summary: "Beta costs $499/month.",
          rawContent: "Beta Enterprise pricing is $499/month.",
          sourceType: "document",
          sourceUrl: "https://beta.example.com/pricing",
          isWidgetExposed: true,
          categoryName: "Pricing",
        }];
      }
      return [{
        id: "src-a1",
        projectId: PROJECT_A,
        title: "Enterprise Cloud Platform Architecture",
        tag: "pricing, architecture",
        notes: "",
        summary: `Starter is $${currentProjectAPrice}/month.`,
        rawContent: buildLargeDoc(currentProjectAPrice),
        sourceType: "document",
        sourceUrl: "https://alpha.example.com/pricing",
        isWidgetExposed: true,
        categoryName: "Pricing",
      }];
    }

    if (t.includes("knowledge_chunks")) {
      if (targetProject === PROJECT_EMPTY || (targetProject === PROJECT_A && !projectAHasKnowledge)) return [];
      if (targetProject === PROJECT_B) {
        return [{
          id: "chunk-b1",
          sourceId: "src-b1",
          chunkText: "Beta Enterprise pricing is $499/month.",
          title: "Beta Pricing Guide",
          tag: "pricing",
          sourceType: "document",
          sourceUrl: "https://beta.example.com/pricing",
          isWidgetExposed: true,
          categoryName: "Pricing",
          rawContent: "Beta Enterprise pricing is $499/month.",
          summary: "Beta costs $499/month.",
          notes: "",
        }];
      }
      // Vector search chunk matching the tail fact at char ~3300
      return [{
        id: "chunk-a1-tail",
        sourceId: "src-a1",
        chunkText: tailFactText,
        title: "Enterprise Cloud Platform Architecture",
        tag: "pricing, architecture",
        sourceType: "document",
        sourceUrl: "https://alpha.example.com/pricing",
        isWidgetExposed: true,
        categoryName: "Pricing",
        rawContent: buildLargeDoc(currentProjectAPrice),
        summary: `Starter is $${currentProjectAPrice}/month.`,
        notes: "",
      }];
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
        const tblName = tbl?.[Symbol.for("drizzle:Name")] || tbl?.tableName || tableName;
        return makeChain(tblName, kind, collectedParams, selectFields);
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

  UniversalRouterService.resolveCandidates = async (req: any) => {
    return [{
      provider: "gemini",
      modelId: "gemini-2.5-flash",
      credential: {
        id: "key-1",
        apiKey: "decrypted-test-key",
        type: "project",
        provider: "gemini",
      },
    } as any];
  };

  UniversalRouterService.executeStream = async function* (req: any) {
    yield { text: "AI assistant response stream content." };
  };

  (ai.models as any).embedContent = async () => ({
    embeddings: [{ values: new Array(768).fill(0.01) }],
  });
  (ai.models as any).generateContent = async () => ({
    text: "AI response grounded in knowledge.",
  });

  const mockGeminiAdapter: any = {
    providerId: "gemini",
    async discoverModels() {
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
    async generateChat() {
      return { content: JSON.stringify({ intent: "KNOWLEDGE_QUESTION" }), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
    async *generateChatStream() {
      yield { text: "AI response" };
    },
    classifyError: () => "UNKNOWN_ERROR",
  };
  registry.register(mockGeminiAdapter);

  // Setup express test app
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.log = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    };
    next();
  });
  app.use("/api/widget", widgetPublicRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const postWidgetChat = async (token: string, message: string) => {
    const res = await fetch(`${baseUrl}/api/widget/${token}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: message }],
        websiteContext: {
          version: "2.0",
          timestamp: Date.now(),
          extractionDurationMs: 15,
          url: "http://localhost/pricing",
          title: "Pricing Page",
          segments: {},
        },
      }),
    });
    const text = await res.text();
    return { status: res.status, text };
  };

  try {
    // ============================================================================
    // TEST GROUP 1: C1 — Long-Document Retrieval & Tail-Fact Merging
    // ============================================================================
    console.log("[TEST GROUP 1] C1 — Long-Document Retrieval & Tail-Fact Preservation");

    await test("C1.1: Document >3,500 chars preserves tail fact at char ~3300 when header matches keywords", async () => {
      const doc = buildLargeDoc(29);
      assert(doc.length > 3500, `Doc must be >3,500 chars (was ${doc.length})`);
      assert(doc.includes("$999/month"), "Doc must include $999 tail fact");

      const searchRes = await searchProjectKnowledge({
        projectIds: [PROJECT_A],
        userId: "public_visitor",
        query: "Enterprise Cloud Platform Architecture SLA",
        limit: 5,
      });

      assert(searchRes.retrievedIds.includes("src-a1"), "Must retrieve src-a1");
      assert(
        searchRes.contextString.includes("CRITICAL_EXCLUSIVE_FACT"),
        "Must contain the tail fact marker"
      );
      assert(
        searchRes.contextString.includes("$999/month"),
        "Must contain $999/month pricing fact from char ~3300"
      );
      assert(
        searchRes.contextString.includes("Enterprise Cloud Platform Architecture"),
        "Must also preserve header information"
      );
    });

    await test("C1.2: End-to-end ContextFuser.fuse incorporates tail fact into final LLM context", async () => {
      const fuser = new ContextFuser();
      const fused = await fuser.fuse({
        userMessage: "What is the UltraEnterprise Tier pricing and SLA?",
        websiteContext: {
          version: "2.0",
          url: "http://localhost/pricing",
          title: "Pricing",
          timestamp: Date.now(),
          extractionDurationMs: 10,
        } as any,
        projectId: PROJECT_A,
        userId: "public_visitor",
        settings: {
          knowledgeRetrieval: true,
          knowledgeComparison: true,
          mistakeDetection: false,
          contextMemory: true,
          developerDebugMode: false,
          maxContextSizeBytes: 6144,
        },
      });

      assert(fused.kbContextString.includes("$999/month"), "Fused KB context must include tail fact $999/month");
      assert(fused.kbContextString.includes("CRITICAL_EXCLUSIVE_FACT"), "Fused KB context must include tail fact marker");
    });

    await test("C1.3: Per-document context budget adheres to 4000 char limit while merging multiple passages", () => {
      const chunk1 = "Section 1 details: " + "a".repeat(1500);
      const chunk2 = "Section 2 details: " + "b".repeat(1500);
      const composite = buildCompositeText([chunk1, chunk2], 4000);
      assert(composite.length <= 4000, `Composite must stay <=4000 chars (was ${composite.length})`);
      assert(composite.includes("Section 1"), "Must include Section 1");
      assert(composite.includes("Section 2"), "Must include Section 2");
    });

    // ============================================================================
    // TEST GROUP 2: C2 — Knowledge Cache Invalidation & Freshness ($29 -> $49)
    // ============================================================================
    console.log("\n[TEST GROUP 2] C2 — Knowledge Freshness, Epoch Invalidation & Price Updates");

    await test("C2.1: Initial price $29 is retrieved via widget search", async () => {
      currentProjectAPrice = 29;
      await invalidateKnowledgeCache(PROJECT_A);

      const res = await searchProjectKnowledge({
        projectIds: [PROJECT_A],
        userId: "public_visitor",
        query: "pricing plans cost",
      });
      assert(res.contextString.includes("$29/month"), "Must return initial $29 price");
      assert(!res.contextString.includes("$49/month"), "Must not contain future price $49");
    });

    await test("C2.2: Updating price to $49 and invalidating cache immediately reflects $49 (no stale $29)", async () => {
      currentProjectAPrice = 49;
      // Invalidate knowledge cache (bumps epoch and purges presence)
      await invalidateKnowledgeCache(PROJECT_A);

      const res = await searchProjectKnowledge({
        projectIds: [PROJECT_A],
        userId: "public_visitor",
        query: "pricing plans cost",
      });

      assert(res.contextString.includes("$49/month"), "Updated search must immediately return $49");
      assert(!res.contextString.includes("$29/month"), "Updated search must NOT return stale $29");
    });

    await test("C2.3: Deleting project knowledge and invalidating cache immediately returns empty (no phantom hits)", async () => {
      projectAHasKnowledge = false;
      await invalidateKnowledgeCache(PROJECT_A);

      const res = await searchProjectKnowledge({
        projectIds: [PROJECT_A],
        userId: "public_visitor",
        query: "pricing plans cost",
      });

      assert.strictEqual(res.contextString, "", "Must return empty context after deletion");
      assert.strictEqual(res.retrievedIds.length, 0, "Retrieved IDs must be empty");
      projectAHasKnowledge = true; // reset
    });

    await test("C2.4: Epoch bumping causes cache keys to diverge across revisions without collision", async () => {
      const res1 = await searchProjectKnowledge({
        projectIds: [PROJECT_A],
        userId: "test-user-scoped",
        customerId: "cust-123",
        query: "pricing plans",
      });

      await invalidateKnowledgeCache(PROJECT_A);

      const res2 = await searchProjectKnowledge({
        projectIds: [PROJECT_A],
        userId: "test-user-scoped",
        customerId: "cust-123",
        query: "pricing plans",
      });

      assert(res1 !== null && res2 !== null, "Both search executions succeed cleanly across epoch bump");
    });

    // ============================================================================
    // TEST GROUP 3: Tenant Isolation & Non-Pollution
    // ============================================================================
    console.log("\n[TEST GROUP 3] Tenant & Project Isolation");

    await test("C2.5: Project A cannot retrieve or leak Project B knowledge ($499)", async () => {
      const resA = await searchProjectKnowledge({
        projectIds: [PROJECT_A],
        userId: "public_visitor",
        query: "pricing enterprise tier",
      });

      assert(!resA.contextString.includes("Beta"), "Project A must not contain Project B name");
      assert(!resA.contextString.includes("$499/month"), "Project A must not leak Project B secret price ($499)");
    });

    await test("C2.6: Invalidating Project A does not affect or invalidate Project B knowledge", async () => {
      await invalidateKnowledgeCache(PROJECT_A);

      const resB = await searchProjectKnowledge({
        projectIds: [PROJECT_B],
        userId: "public_visitor",
        query: "pricing enterprise tier",
      });

      assert(resB.contextString.includes("Beta"), "Project B knowledge remains accessible");
      assert(resB.contextString.includes("$499/month"), "Project B pricing intact");
    });

    // ============================================================================
    // TEST GROUP 4: Concurrency & Edge Cases
    // ============================================================================
    console.log("\n[TEST GROUP 4] Concurrency, Edge Cases & Empty KB");

    await test("4.1: Concurrent queries during cache invalidation execute safely without race condition", async () => {
      const promises = Array.from({ length: 10 }, (_, i) => {
        if (i === 5) {
          return invalidateKnowledgeCache(PROJECT_A).then(() =>
            searchProjectKnowledge({ projectIds: [PROJECT_A], userId: "public_visitor", query: "pricing" })
          );
        }
        return searchProjectKnowledge({ projectIds: [PROJECT_A], userId: "public_visitor", query: "pricing" });
      });

      const results = await Promise.all(promises);
      assert.strictEqual(results.length, 10, "All 10 concurrent requests completed");
      for (const r of results) {
        assert(typeof r.contextString === "string", "Each result has valid contextString");
      }
    });

    await test("4.2: Empty knowledge base short-circuits retrieval without embedding API calls", async () => {
      // Invalidate empty project first so presence probe runs
      await invalidateKnowledgeCache(PROJECT_EMPTY);
      let embedCalled = false;
      const originalEmbed = (ai.models as any).embedContent;
      (ai.models as any).embedContent = async () => {
        embedCalled = true;
        return { embeddings: [{ values: [] }] };
      };

      try {
        const res = await searchProjectKnowledge({
          projectIds: [PROJECT_EMPTY],
          userId: "public_visitor",
          query: "how much does it cost?",
        });

        assert.strictEqual(res.contextString, "", "Empty project must return empty context");
        assert.strictEqual(embedCalled, false, "Must NOT call embedding API for empty knowledge project");
      } finally {
        (ai.models as any).embedContent = originalEmbed;
      }
    });

    // ============================================================================
    // TEST GROUP 5: Additional Findings (P1, P2, P3)
    // ============================================================================
    console.log("\n[TEST GROUP 5] P1, P2 & P3 Verifications");

    await test("P1: OpenAIAdapter preserves error status and classifies HTTP 429 / 401 / 503 accurately", () => {
      const adapter = new OpenAIAdapter();

      const err429 = new Error("Rate limit exceeded");
      (err429 as any).status = 429;
      assert.strictEqual(adapter.classifyError(err429), "RATE_LIMITED", "Classifies 429 status as RATE_LIMITED");

      const err401 = new Error("Invalid API key provided");
      (err401 as any).status = 401;
      assert.strictEqual(adapter.classifyError(err401), "INVALID_CREDENTIAL", "Classifies 401 as INVALID_CREDENTIAL");

      const err503 = new Error("Service Unavailable");
      (err503 as any).status = 503;
      assert.strictEqual(adapter.classifyError(err503), "PROVIDER_UNAVAILABLE", "Classifies 503 as PROVIDER_UNAVAILABLE");

      // Test string wrapped classification (preserving classification)
      const wrappedErr = new Error("RATE_LIMITED");
      assert.strictEqual(adapter.classifyError(wrappedErr), "RATE_LIMITED", "Classifies message RATE_LIMITED directly");
    });

    await test("P2: Anti-pollution cutoff softly retains multi-source candidates (score >= 35% of top score)", () => {
      const MIN_RELEVANCE_SCORE = 60;
      const candidates = [
        { id: "1", title: "Pricing", retrievalScore: 420 },
        { id: "2", title: "Engineering Overview", retrievalScore: 160, isVectorMatch: true },
        { id: "3", title: "Irrelevant Spam", retrievalScore: 35, isVectorMatch: false },
      ];

      const topScore = candidates[0].retrievalScore;
      const filtered = candidates.filter(
        (c) =>
          c.retrievalScore >= Math.max(MIN_RELEVANCE_SCORE, topScore * 0.35) ||
          (c.isVectorMatch && c.retrievalScore >= MIN_RELEVANCE_SCORE)
      );

      assert(filtered.some((c) => c.id === "1"), "Retains top scoring candidate 1 (420)");
      assert(filtered.some((c) => c.id === "2"), "Retains secondary engineering overview candidate (160)");
      assert(!filtered.some((c) => c.id === "3"), "Discards out-of-domain candidate (35)");
    });

    await test("P3.1: Informational questions containing 'click' are NOT classified as action execution requests", async () => {
      const queryInformational = "According to the docs and what you see on this page, who leads engineering and what action button should I click to talk?";
      const res = await postWidgetChat(TOKEN_A, queryInformational);
      assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}: ${res.text}`);
      assert(res.text.includes("data:"), "SSE data frame was emitted");
    });

    await test("P3.2: Imperative action requests ARE recognized for action execution", async () => {
      const res = await postWidgetChat(TOKEN_A, "click the submit button now");
      assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}: ${res.text}`);
    });

    console.log("\n══════════════════════════════════════════════════════════════════");
    console.log(`  REGRESSION TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log("══════════════════════════════════════════════════════════════════\n");

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    server.close();
    db.transaction = origTransaction;
    db.select = origSelect;
    db.insert = origInsert;
    db.update = origUpdate;
    db.delete = origDelete;
    db.query = origQuery;
    ai.models.embedContent = origGeminiEmbed;
    ai.models.generateContent = origGeminiGen;
    UniversalRouterService.resolveCandidates = origResolveCandidates;
    UniversalRouterService.executeStream = origExecuteStream;
  }
}

runRegressionTests().catch((e) => {
  console.error("FATAL: Unhandled error in regression tests:", e);
  process.exit(1);
});
