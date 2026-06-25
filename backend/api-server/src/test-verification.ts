import { 
  validateWebsiteContext, 
  deltaReconstructor, 
  contextFuser, 
  buildContextAwarePrompt,
  sessionMemoryStore 
} from "./services/context-engine";
import type { WebsiteContext } from "./services/context-engine/types";

async function runTests() {
  console.log("=== BEGIN CONTEXT ENGINE VERIFICATION ===");
  
  const mockProjectId = "00000000-0000-0000-0000-000000000000";
  const mockUserId = "11111111-1111-1111-1111-111111111111";
  
  const mockSettings = {
    enabled: true,
    dashboardAnalysis: true,
    formAssistant: true,
    tableAnalysis: true,
    navigationAssistant: true,
    knowledgeComparison: true,
    mistakeDetection: true,
    contextMemory: true,
    developerDebugMode: true,
    maxContextSizeBytes: 6144
  };

  const sessionId = "test-session-123";

  // --- Test 1: Security & Sanitization (Context Validator) ---
  console.log("\n--- TEST 1: SECURITY & VALIDATOR ---");
  const dirtyPayload: any = {
    version: "2.0",
    timestamp: Date.now(),
    extractionDurationMs: 15,
    transport: { mode: "full", sessionHash: "hash", segmentHashes: {}, changedSegments: [], unchangedSegments: [], sequenceNumber: 1 },
    page: { url: "https://example.com?api_key=SECRET_KEY&token=jwt.abc.def", path: "/dashboard", title: "Dashboard", type: "dashboard", breadcrumbs: [], heading: "Main Dashboard" },
    navigation: { items: [] },
    state: { openDialogs: [], visibleErrors: [], visibleWarnings: [], activeFilters: [], scrollPosition: "top", idleTimeMs: 0 },
    workflow: {},
    viewport: { width: 1920, height: 1080, scrollX: 0, scrollY: 0, scrollDepthPercent: 0, visibleElementCount: 10, totalElementCount: 100, viewportCoveragePercent: 10 },
    metadata: { framework: "react", spaDetected: true, domNodeCount: 100, viewportNodeCount: 10, extractedElementCount: 5, cacheHit: false, mutationsSinceLastExtraction: 0, compressionRatio: 1 },
    content: {
      headings: [], cards: [], tables: [], charts: [], lists: [], dialogs: [], buttons: [], stats: [], canvasElements: [], notifications: [],
      forms: [
        {
          data: {
            id: "login",
            fields: [
              { label: "Password", type: "password", name: "pwd", value: "MySecretP@ssword123", required: true, hasError: false },
              { label: "API Key", type: "text", name: "apiKey", value: "sk-live-12345", required: true, hasError: false },
              { label: "SSN", type: "text", name: "ssn", value: "123-45-6789", required: false, hasError: false }
            ]
          }
        }
      ]
    }
  };
  
  const validated = validateWebsiteContext(dirtyPayload, 10240);
  console.log("Sanitized URL:", validated?.page.url);
  const form = validated?.content.forms[0] as any;
  const formFields = form.data ? form.data.fields : form.fields;
  formFields.forEach((f: any) => console.log(`Sanitized Field '${f.label}':`, f.value));

  // --- Test 2: Mistake Detection ---
  console.log("\n--- TEST 2: MISTAKE DETECTION ---");
  const mistakePayload: WebsiteContext = {
    version: "2.0",
    timestamp: Date.now(),
    extractionDurationMs: 10,
    transport: { mode: "full", sessionHash: "hash", segmentHashes: {}, changedSegments: [], unchangedSegments: [], sequenceNumber: 2 },
    page: { url: "https://example.com/checkout", path: "/checkout", title: "Checkout", type: "checkout", breadcrumbs: [], heading: "Checkout Payment" },
    navigation: { items: [] },
    content: {
      headings: [], cards: [], tables: [], charts: [], lists: [], dialogs: [], buttons: [], stats: [], canvasElements: [],
      forms: [{
        data: {
          id: "checkout-form",
          fields: [
            { label: "Email", type: "email", name: "email", value: "", required: true, hasError: false },
            { label: "Zip Code", type: "text", name: "zip", value: "12", required: true, hasError: true, errorMessage: "Zip code must be 5 digits" }
          ],
          hasErrors: true,
          errorMessages: ["Please fix the errors below"],
          completionPercent: 50
        },
        priority: 10, inViewport: true, distanceFromViewport: 0, relevanceSignals: []
      }],
      notifications: [{
        data: { type: "error", message: "Credit card declined" },
        priority: 10, inViewport: true, distanceFromViewport: 0, relevanceSignals: []
      }]
    },
    state: { openDialogs: [], visibleErrors: ["Credit card declined"], visibleWarnings: [], activeFilters: [], scrollPosition: "top", idleTimeMs: 0 },
    workflow: {},
    viewport: { width: 1920, height: 1080, scrollX: 0, scrollY: 0, scrollDepthPercent: 0, visibleElementCount: 10, totalElementCount: 100, viewportCoveragePercent: 10 },
    metadata: { framework: "react", spaDetected: true, domNodeCount: 100, viewportNodeCount: 10, extractedElementCount: 5, cacheHit: false, mutationsSinceLastExtraction: 0, compressionRatio: 1 }
  };

  const fused = await contextFuser.fuse({
    userMessage: "Why can't I checkout?",
    websiteContext: mistakePayload,
    projectId: mockProjectId,
    userId: mockUserId,
    settings: mockSettings as any
  });

  console.log("Detected Mistakes:", JSON.stringify(fused.detectedMistakes, null, 2));

  // --- Test 3: Dashboard & Table Analysis ---
  console.log("\n--- TEST 3: DASHBOARD & TABLE ANALYSIS ---");
  const dashboardPayload: WebsiteContext = {
    ...mistakePayload,
    page: { url: "https://example.com/analytics", path: "/analytics", title: "Analytics", type: "dashboard", breadcrumbs: [], heading: "Analytics Overview" },
    content: {
      ...mistakePayload.content,
      forms: [],
      notifications: [],
      cards: [
        { data: { title: "Revenue", value: "$45,200", trend: "up" }, priority: 10, inViewport: true, distanceFromViewport: 0, relevanceSignals: [] },
        { data: { title: "Active Users", value: "1,204", trend: "down" }, priority: 10, inViewport: true, distanceFromViewport: 0, relevanceSignals: [] }
      ],
      tables: [
        {
          data: {
            caption: "Recent Transactions",
            headers: ["ID", "Amount", "Status"],
            rowCount: 50,
            visibleRows: [["#101", "$50", "Completed"], ["#102", "$120", "Pending"]],
            pagination: { currentPage: 1, totalPages: 5 }
          },
          priority: 8, inViewport: true, distanceFromViewport: 0, relevanceSignals: []
        }
      ]
    }
  };

  const fusedDashboard = await contextFuser.fuse({
    userMessage: "How are my metrics doing?",
    websiteContext: dashboardPayload,
    projectId: mockProjectId,
    userId: mockUserId,
    settings: mockSettings as any
  });

  console.log("Formatted Context String:\n", fusedDashboard.websiteContextString);

  // --- Test 4: Final Prompt Generation ---
  console.log("\n--- TEST 4: PROMPT BUILDER ---");
  sessionMemoryStore.update(sessionId, mistakePayload);
  sessionMemoryStore.update(sessionId, dashboardPayload); // Navigate
  
  const finalPrompt = buildContextAwarePrompt({
    project: { systemPrompt: "Always be polite." },
    fusedContext: fusedDashboard,
    sessionMemory: sessionMemoryStore.getOrCreate(sessionId),
    settings: mockSettings as any,
    handoffInfo: "Contact support at help@example.com"
  });

  console.log("FINAL GENERATED PROMPT:\n", finalPrompt);
  console.log("\n=== END VERIFICATION ===");
  process.exit(0);
}

runTests().catch(console.error);
