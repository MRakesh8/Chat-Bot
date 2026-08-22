# Current Project Architecture & Next Steps

> **Prepared by:** Architecture Discovery Agent
> **Codebase snapshot:** 2026-08-22
> **Analysis scope:** Full codebase inspection — no implementation performed

---

## 1. Current Architecture Summary

This project is a **multi-tenant SaaS AI Chatbot / Widget Studio platform** built as a TypeScript/Node.js monorepo (pnpm workspaces).

### Stack

| Layer | Technology |
|---|---|
| Backend API | Express.js 5, TypeScript, Pino logging |
| Database | PostgreSQL via Drizzle ORM (Supabase) |
| Vector Search | pgvector (768-dim, `gemini-embedding-2`) |
| AI Providers | Gemini, OpenAI, Claude, Groq, DeepSeek, OpenRouter |
| Frontend | React (chat-app), TanStack Query |
| Queue | BullMQ + ioredis |
| Auth | Supabase Auth (`supabaseAuthMiddleware`) |
| File Storage | Supabase Storage |
| Payments | Manual UPI + Razorpay/Stripe (schema ready) |
| Deployment | Render (render.yaml) + Vercel (frontend) |

### Monorepo Structure

```
/backend/api-server       — Express API, AI routing, agent logic
/database/db              — Drizzle ORM schema, migrations
/frontend/chat-app        — React dashboard
/shared                   — Shared types/utilities
/database/db/drizzle      — Migration SQL files (0000-0007)
```

---

## 2. Complete Feature Inventory (Phase A)

| # | Feature | Status | Evidence |
|---|---|---|---|
| 1 | Authentication | IMPLEMENTED | `middlewares/supabaseAuth.ts` — JWT, DB user hydration, membership |
| 2 | Users & Roles | IMPLEMENTED | `schema: users` — super_admin, admin, user, client + feature flags |
| 3 | Organizations | IMPLEMENTED | `organizations`, `organization_members`, `organization_usage` |
| 4 | Project Ownership | IMPLEMENTED | `projectOwnershipGuard`, `authorizeMembership` middleware |
| 5 | Widget Studio | IMPLEMENTED | `frontend/project/widget-studio.tsx` (1329 lines) |
| 6 | Website Scraping | PARTIALLY IMPLEMENTED | `knowledge.ts` L767-799: single-URL fetch + HTML strip + AI fallback. No crawling |
| 7 | Current-Page Understanding | IMPLEMENTED | `context-engine/` — WebsiteContext v2.0 from embedded widget |
| 8 | Scroll/Content Extraction | IMPLEMENTED | `ViewportContext` (scrollDepthPercent, scrollY, viewportCoveragePercent) |
| 9 | Multi-Page Website Crawling | NOT IMPLEMENTED | No crawl queue, no link following, no robots.txt |
| 10 | Internal Link Discovery | EXISTS BUT NOT CONNECTED | `extractLinks()` extracts URLs from saved text but never crawls them |
| 11 | RAG | IMPLEMENTED | `searchProjectKnowledge()` — hybrid vector cosine + keyword (ilike), 5-min cache |
| 12 | Context Engine | IMPLEMENTED | context-fuser, delta-reconstructor, session-memory, intent-classifier, prompt-builder |
| 13 | Knowledge Base | IMPLEMENTED | Multi-format: PDF, DOCX, YouTube, GitHub, Website, Images, Audio, Video, ZIP |
| 14 | Project Context Isolation | IMPLEMENTED | All queries filtered by projectId. withTenantContext / withBypassRLS |
| 15 | AI Provider Routing | IMPLEMENTED | `UniversalProviderAdapter` — Gemini, OpenAI, Claude, Groq, DeepSeek, OpenRouter |
| 16 | Gemini Integration | IMPLEMENTED | `@workspace/integrations-gemini-ai` — embeddings + primary model |
| 17 | Groq Integration | IMPLEMENTED | OpenAI-compatible via Groq base URL in `llm-provider.ts` |
| 18 | API Key Management | IMPLEMENTED | `routes/api-keys/index.ts` (26KB). Encrypted, masked, health-tracked |
| 19 | API Health Monitoring | IMPLEMENTED | `services/api-health.ts` — 13 error types, health score, latency moving avg |
| 20 | Quota Tracking | IMPLEMENTED | `security/quota.ts` — `checkAndIncrementUsage()`, plan limits, billing cycle |
| 21 | Failover | IMPLEMENTED | `executeWithFallback()` — 5-model chain + `executeWithRetry()` with exp. backoff |
| 22 | Trial System | IMPLEMENTED | `security/entitlement.ts` — atomic init, configurable days, race-safe upsert |
| 23 | Subscription System | IMPLEMENTED | projectLicenses, projectEntitlements, payments, paymentLogs, plans |
| 24 | Entitlements | IMPLEMENTED | `checkProjectEntitlement()` — 6-tier precedence logic |
| 25 | Allowed Domains | IMPLEMENTED | `security/domain.ts` — `validateWidgetOrigin()`, wildcard support |
| 26 | Security Foundation | IMPLEMENTED | authGuard, adminRoleGuard, projectOwnershipGuard, entitlementGuard, safeErrorHandler |
| 27 | Prompt Injection Protection | IMPLEMENTED | `prompt-firewall.ts` + `promptBoundary.ts` `buildStructuredPrompt()` |
| 28 | Sensitive Data Redaction | IMPLEMENTED | `security/sensitiveData.ts`, `knowledge.ts maskSecrets()` |
| 29 | Rate Limiting | IMPLEMENTED | `security/rateLimiter.ts` applied to public widget endpoints |
| 30 | Audit Logging | IMPLEMENTED | `security_audit_logs` table + `logSecurityEvent()` + `enterprise_audit_logs` |
| 31 | Agent Coordinator | IMPLEMENTED | `agents/coordinator.ts` — Planner→Security→Steps→Verification, DB-persisted |
| 32 | Agent Action Engine | PARTIALLY IMPLEMENTED | Backend plans actions; client widget executes them via SSE delivery |
| 33 | Browser Automation | PARTIALLY IMPLEMENTED | Puppeteer installed but not used. Widget JS handles DOM interaction |
| 34 | Swarm/Dry-Run Features | PARTIALLY IMPLEMENTED | Coordinator handles `resumeExecution`. No explicit dry-run/swarm mode |
| 35 | User Task Planning | IMPLEMENTED | `agents/planner.ts` — LLM generates JSON action plans, cached |
| 36 | Conversation/Session State | IMPLEMENTED | chatSessions, messages tables + session-memory.ts in-memory (30-min TTL) |
| 37 | Lead Capture | IMPLEMENTED | `services/lead-detection.ts` — hooked into widget chat flow |
| 38 | Analytics | IMPLEMENTED | widgetAnalytics table + upgraded GET /analytics + frontend dashboard |
| 39 | Frequent Questions | IMPLEMENTED | frequentQuestions table (schema only, NOT in migration). `question-normalization.ts` |
| 40 | Knowledge Gaps | IMPLEMENTED | knowledgeGaps extended (new columns NOT in migration). `unanswered-questions.ts` |
| 41 | Live Interaction Monitoring | PARTIALLY IMPLEMENTED | Live Stream tab exists but polls — no WebSocket/SSE push |
| 42 | Error Handling | IMPLEMENTED | safeErrorHandler, sendSafeError, isRetryableLlmError, executeWithRetry |
| 43 | Error Monitoring | PARTIALLY IMPLEMENTED | system_errors table exists; no automated insertion or alerting |
| 44 | Recovery/Retry Logic | IMPLEMENTED | Exp. backoff (3 retries), model fallback, API key cooldowns, step retryCount (max 3) |
| 45 | Admin Dashboard | IMPLEMENTED | `routes/super-admin/index.ts` — users, projects, payments, entitlements, errors |
| 46 | Project Owner Dashboard | IMPLEMENTED | analytics.tsx, api-keys.tsx, knowledge-base.tsx, widget-studio.tsx, deployment.tsx |
| 47 | Feature Access Control | IMPLEMENTED | users.features JSONB + role weights (owner=5, admin=4, manager=3, agent=2, viewer=1) |
| 48 | Notification Architecture | NOT IMPLEMENTED | No email/webhook/push system. No notification tables |
| 49 | UI Architecture | IMPLEMENTED | React + TanStack Query + shadcn/ui components |

---

## 3. Newly Completed Lead Analytics Status (Phase G)

### Connection to Widget Message Flow
- CONNECTED: `processAndSaveLead()` fires asynchronously on every chat message (widget-public.ts L717)
- CONNECTED: `trackUserQuestion()` fires asynchronously on every user message (L724)
- CONNECTED: `trackKnowledgeGap()` fires after LLM response when fallback detected OR no RAG chunks (L1037-1045)

### Analytics Population
- `widgetAnalytics` updated on every message (conversations, messages, uniqueVisitors, tokenUsage)
- Lead detection fires on user message content -> saves to widgetLeads when signals found
- frequentQuestions upserted per normalized question
- knowledgeGaps incremented when fallback or no-RAG-match detected

### Project Ownership Isolation
- `router.use(authorizeMembership("viewer"))` at router level (projects/widget.ts L13) protects all routes
- All DB queries filter by `eq(table.projectId, projectId)` explicitly
- `authorizeMembership` resolves project -> organization and validates org membership

### CRITICAL: Database Migration Gap

> [!CAUTION]
> The `frequentQuestions` table and all new `widgetLeads`/`knowledgeGaps` columns are defined in the Drizzle schema (`schema/index.ts`) but are NOT present in any migration file. Confirmed by grep across all 8 migration files in `database/db/drizzle/`.
>
> The latest migration `0007_bent_pretty_boy.sql` includes `knowledge_gaps` with only the original columns — none of the new ones (normalized_question, source_url, session_id, confidence, reason).
>
> **Impact**: Runtime column-not-found errors for all new analytics features.

### Route Registration
- All new endpoints (GET /analytics, PATCH /leads/:leadId, GET /top-questions, GET /unanswered-questions, PATCH /unanswered-questions/:gapId/resolve) are inside the authenticated router in widget.ts

### Frontend vs. Backend
- analytics.tsx correctly calls `/api/projects/:projectId/widget/analytics` and other new endpoints

### Test Coverage
- Only helper-function unit tests exist (test-lead-analytics.ts script). No API integration tests or DB write verification.

### Summary — IMPLEMENTED BUT NEEDS INTEGRATION
- CRITICAL: Missing database migration for all new schema additions
- MINOR: Knowledge gap over-reporting when bot answers correctly from website context only (no RAG chunks needed)
- MINOR: Live stream tab has no real-time push mechanism

---

## 4. Website Understanding Analysis (Phase B)

### Two Separate Mechanisms

**Mechanism 1 — Static Knowledge Base Ingestion (`knowledge.ts`)**
- Single URL submitted -> fetch() with 10s timeout -> HTML tag strip -> AI chunk/embed -> stored as knowledgeSource
- Falls back to Gemini search tool if fetch fails
- No JS rendering, no link following, no multi-page crawl

**Mechanism 2 — Live Per-Session Context Engine (`context-engine/`)**
- Embedded widget JS sends WebsiteContext v2.0 JSON on each user message
- Contains: page URL, title, type, breadcrumbs, nav state, forms, tables, stats, viewport scroll data
- Backend reconstructs full context from deltas (sequence-numbered, 30-min session cache)
- Fused with KB results and sent to LLM in structured prompt
- Session-scoped only — NOT stored as project knowledge across sessions

### Capability Matrix

| Capability | Status | Notes |
|---|---|---|
| Reads visible viewport | YES | Via widget JS DOM scanner |
| Detects scroll depth | YES | ViewportContext.scrollDepthPercent |
| Extracts full page text | PARTIAL | Static: no JS rendering. Live: structured data only, not raw text |
| Detects dynamic content | PARTIAL | Live widget sees live DOM. Static ingestion misses JS-rendered content |
| Discovers internal links | NO | extractLinks() reads already-saved text; does not follow links |
| Crawls multiple pages | NO | No crawl queue, no scheduler |
| Identifies important pages | NO | No sitemap parsing or page scoring |
| Filters irrelevant pages | NO | No URL filter or scoring |
| Stores info per project | YES | All knowledgeSources scoped by projectId |
| Updates stale content | NO | No re-crawl scheduling or change detection |

### Reusable Components for Full Crawl
- `assertPublicHttpUrl()` — SSRF protection
- `extractLinks()` — link extraction from HTML
- `extractSourceContent()` — full per-URL extraction pipeline
- `processKnowledgeSource()` — chunk, embed, store
- `searchProjectKnowledge()` — RAG retrieval
- BullMQ infrastructure (from WhatsApp integration) — async job queue
- knowledgeSources + knowledgeChunks tables

### Missing Components
- Crawl URL queue with depth and domain limits
- robots.txt parser
- Sitemap.xml parser
- Page importance scoring
- Puppeteer for JS-rendered pages (installed but unused for crawling)
- Change detection and re-crawl scheduling
- Per-crawl rate limiting and politeness delay

---

## 5. Agent Architecture Analysis (Phase C)

### Agent Modules (`backend/api-server/src/agents/`)

| Agent | Status | Purpose |
|---|---|---|
| BaseAgent | IMPLEMENTED | Common execute(context) -> AgentResult interface |
| PlannerAgent | IMPLEMENTED | LLM generates JSON action plan from intent + page context. Cached |
| CoordinatorAgent | IMPLEMENTED | Orchestrates full execution: plan -> security -> steps -> verify -> retry |
| SecurityAgent | IMPLEMENTED | Checks RBAC (websitePermissions), emits enterprise_audit_logs |
| VerificationAgent | IMPLEMENTED | Verifies action results (URL changed? DOM mutated? Element found?) |
| NavigationAgent | STUB | Simple navigation target resolution |
| MemoryAgent | STUB | Reads/writes websiteMemory per session |
| KnowledgeAgent | STUB | KB reads |
| ContextCompressor | IMPLEMENTED | Compresses context for LLM token limits |
| ToolsAgent | STUB | Tool calling interface |

Also: `security/agentSafety.ts` — `evaluateActionRisk()` (LOW/MEDIUM/HIGH/CRITICAL) and `requiresConfirmation()` are implemented but NOT called by CoordinatorAgent or SecurityAgent.

### Workflow Capability Matrix

| Capability | Status | Notes |
|---|---|---|
| Intent understanding | YES | PlannerAgent + intent-classifier.ts |
| Task planning | YES | JSON action plan via LLM, cached 5 minutes |
| Multi-step execution | YES | CoordinatorAgent + workflowExecutions/executionSteps tables |
| Missing information detection | NO | No pause-and-ask mechanism |
| User clarification | NO | Not implemented |
| Task state persistence | YES | workflowExecutions in DB + SessionMemoryStore in-memory |
| Browser/page inspection | YES | WebsiteContext v2 from widget on every message |
| Form filling | YES (design) | type action planned; client widget executes |
| Clicking | YES (design) | click action planned; client executes |
| Navigation | YES (design) | navigate action; client handles URL change |
| Server-side execution | NO | Actions sent to frontend via SSE; client executes |
| Risk classification | YES | agentSafety.ts evaluateActionRisk() — but NOT wired to Coordinator |
| High-risk confirmation | PARTIAL | requiresConfirmation field set but agentSafety.ts not called |
| Post-action verification | YES | VerificationAgent checks URL, DOM, element find |
| Retry/recovery | YES | retryCount max 3, failed_final state |

### Key Performance Issue
PlannerAgent is invoked unconditionally after EVERY LLM response in the normal chat flow (widget-public.ts L1051-1066). This fires a full LLM call for every conversational reply, wasting tokens and adding latency. Should only fire on ACTION_REQUEST signals.

---

## 6. Knowledge and Context Architecture (Phase D)

### Data Isolation by Type

| Data Type | Storage | Project Isolation | Notes |
|---|---|---|---|
| Project knowledge (manual) | knowledgeSources + knowledgeChunks | YES — projectId FK | All sources scoped per project |
| Website knowledge (ingested) | knowledgeSources (sourceType=website) | YES — projectId FK | Same table as manual |
| User uploads | Supabase Storage + knowledgeSources | YES — projectId FK | |
| Conversation context | chatSessions + messages | YES — projectId FK | |
| Live page context | session-memory.ts in-memory | YES — keyed by sessionId | 30-min TTL, process-local |
| RAG retrieval | searchProjectKnowledge() | YES — projectIds array enforced | |
| Agent execution state | workflowExecutions, executionSteps | YES — via sessionId -> projectId | |
| Website memory | websiteMemory | YES — via sessionId | Per-session only |

### Architecture Risk Assessment
- LOW RISK: RAG search receives `projectIds: [projectId]` — callers control scope
- LOW RISK: Session memory keyed by opaque session IDs — no cross-project access
- LOW RISK: `knowledgeRetrievalCache` keyed by `projectId + query hash` — no cross-project poisoning
- NO RISK FOUND: All reviewed DB queries consistently apply `eq(table.projectId, projectId)`

---

## 7. Reliability and Self-Recovery Analysis (Phase E)

```
LEVEL 1 — Auto-Retry (IMPLEMENTED)
  Sources: HTTP 500/502/503/504/408, timeouts, "service unavailable"
  Mechanism: 3 retries, exponential backoff (500ms -> 1s -> 2s)
  Location: widget-public.ts executeWithRetry()

LEVEL 2 — Auto Provider/Model Switch (IMPLEMENTED)
  Sources: Invalid model (400/404), quota exhaustion (429), rate limits
  Mechanism: 5-model fallback chain, per-key cooldowns, key auto-disable on invalid key
  Cooldowns: Rate limit=1min, Daily quota=24h, Monthly credit=30d
  Location: widget-public.ts executeWithFallback(), services/api-health.ts

LEVEL 3 — Automatic Safe Recovery (PARTIAL)
  Implemented: DB health check middleware, LLM response cache (serves cached on failure)
  Missing: Redis/BullMQ health check, graceful BullMQ degradation

LEVEL 4 — Create Admin Alert (NOT IMPLEMENTED)
  system_errors table exists but no auto-insertion or alerting
  Admin must poll /api/super-admin routes manually

LEVEL 5 — Manual Investigation Required
  Invalid DB schema (e.g., missing migration), Supabase Auth issues, SSL errors
```

### Missing Infrastructure
- Automated alerting (email/webhook) for Level 4 errors
- BullMQ/Redis health check endpoint
- Graceful BullMQ degradation when Redis is down
- Circuit breaker for sustained provider failures
- Automated system_errors insertion from caught exceptions

---

## 8. Security Compatibility Analysis (Phase F)

### Existing Security Modules — DO NOT DUPLICATE OR WEAKEN

| Module | File | Purpose |
|---|---|---|
| authGuard | security/middleware.ts | Rejects unauthenticated requests |
| adminRoleGuard | security/middleware.ts | Verifies super_admin or admin DB role |
| projectOwnershipGuard | security/middleware.ts | User owns or belongs to project's org |
| entitlementGuard | security/middleware.ts | Trial/subscription status check |
| authorizeMembership | middlewares/authorizeMembership.ts | Role-weighted org membership |
| validateWidgetOrigin | security/domain.ts | Domain allow-list for public widget |
| checkProjectEntitlement | security/entitlement.ts | Atomic trial + subscription check |
| checkAndIncrementUsage | security/quota.ts | Quota enforcement with usage trail |
| buildStructuredPrompt | security/promptBoundary.ts | Isolates untrusted webpage content |
| redactSensitiveContext | security/sensitiveData.ts | Strips sensitive data from AI context |
| detectPromptInjection | middlewares/prompt-firewall.ts | Blocks injection patterns |
| evaluateActionRisk | security/agentSafety.ts | LOW/MEDIUM/HIGH/CRITICAL classification |
| requiresConfirmation | security/agentSafety.ts | True for HIGH/CRITICAL actions |
| logSecurityEvent | security/middleware.ts | Writes to security_audit_logs |
| sendSafeError | security/errorResponse.ts | No stack trace leakage |
| maskSecrets | services/knowledge.ts | Strips API keys and CC numbers |

### Security Requirements for Future Features

**Website Intelligence (Crawler)**
- Use assertPublicHttpUrl() for SSRF protection
- Enforce checkAndIncrementUsage("crawl", n) per page
- Log crawl events via logSecurityEvent
- Never crawl unsanitized user-supplied URLs

**AI Agent Task Execution**
- Use evaluateActionRisk() from agentSafety.ts (currently disconnected)
- Require user confirmation for HIGH and CRITICAL actions
- Never auto-execute CRITICAL actions (payments, deletes, account changes)
- Use buildStructuredPrompt() for all LLM calls with external content
- All agent actions logged via enterpriseAuditLogs (already implemented in SecurityAgent)

---

## 9. Integration Gaps

| Gap | Severity | Description |
|---|---|---|
| Missing DB migration | CRITICAL | frequent_questions table and new widget_leads/knowledge_gaps columns not in any migration |
| agentSafety.ts disconnected | MEDIUM | evaluateActionRisk() and requiresConfirmation() defined but not called by CoordinatorAgent |
| Unconditional agent invocation | MEDIUM | CoordinatorAgent runs on every message — should only fire on ACTION_REQUEST |
| No notification system | MEDIUM | No alerts for admins or project owners |
| Live stream no push | LOW-MEDIUM | Live Stream tab polls; no WebSocket/SSE push to dashboard |
| No clarification capability | MEDIUM | Agent cannot pause to ask user for missing required fields |
| No multi-page crawling | MEDIUM | Static website knowledge is single-URL only |
| Knowledge gap over-reporting | LOW | Fires on no-RAG-match even when bot answers correctly from website context |
| Session memory process-local | LOW | In-memory only; multi-instance deployments lose session state on restart |

---

## 10. Information Required From Project Owner (Phase H)

### Q1: Website Crawler Scope
**Why it matters**: Determines crawl depth limits, URL pattern filters, storage requirements.
**Options**: (A) All pages up to depth N, (B) Sitemap.xml only, (C) User-specified URL patterns, (D) AI-selected important pages.
**Recommended**: (D) Crawl sitemap + AI-scored page importance.

### Q2: Agent Execution Model
**Why it matters**: Server-side Puppeteer allows actions on any website; client-side requires widget embedded on target site.
**Options**: (A) Client-side only (current), (B) Server-side Puppeteer, (C) Both modes per project.
**Recommended**: (A) Client-side for now — Puppeteer server-side requires auth handling and is significantly more complex.

### Q3: Missing Field Clarification UX
**Why it matters**: Determines agent architecture for gather_info steps.
**Options**: (A) One question at a time in chat, (B) Inline form in widget, (C) List all missing fields at once.
**Recommended**: (A) Minimal code change, best UX for existing chat interface.

### Q4: Notification Delivery Channels
**Options**: (A) Email, (B) Webhook (Slack etc.), (C) In-app notification bell, (D) SMS.
**Recommended**: (C) In-app first, then (B) webhook for integrations.

### Q5: Knowledge Gap Threshold
**Why it matters**: Current implementation reports gaps on no-RAG-match AND AI fallback — may be noisy.
**Options**: (A) Only AI-explicit fallback text, (B) Also no-RAG-match (current), (C) Configurable per project.
**Recommended**: (A) Less noise while still catching real gaps.

---

## 11. Recommended Implementation Roadmap (Phase I)

### PHASE 1 — Fix Incomplete Integrations (HIGHEST PRIORITY)

**Goal**: Make all newly implemented features work in production.

| Task | Reuse | Files |
|---|---|---|
| Generate + apply DB migration for frequent_questions and new columns | Drizzle CLI | NEW migration file in database/db/drizzle/ |
| Connect evaluateActionRisk() to CoordinatorAgent | security/agentSafety.ts | agents/coordinator.ts |
| Gate Coordinator to only fire on ACTION_REQUEST signals | Existing ACTION_REQUEST handling | routes/widget-public.ts L1048-1066 |
| Revise knowledge gap to only fire on AI_FALLBACK (not no-RAG-match) | services/unanswered-questions.ts | routes/widget-public.ts L1037 |

**Dependencies**: None
**Security**: No changes to security guards
**Risks**: Migration must be backward-compatible
**Verification**: TypeScript check passes, migration applies, analytics returns correct data

---

### PHASE 2 — Full Website Intelligence

**Goal**: AI understands and traverses entire connected website, not just one URL.

**Reuse**: assertPublicHttpUrl(), extractSourceContent(), processKnowledgeSource(), checkAndIncrementUsage("crawl"), knowledgeSources + knowledgeChunks tables, BullMQ infrastructure, extractLinks()

**New**: `services/website-crawler.ts` — crawl queue, robots.txt, depth/domain limits, page scoring. New migration: `website_crawl_jobs` table.

**Modify**: routes/projects/index.ts (add POST /:projectId/crawl), services/knowledge.ts (export re-crawl handler)

**Security**: assertPublicHttpUrl() mandatory, checkAndIncrementUsage("crawl") mandatory, logSecurityEvent for each crawl batch

---

### PHASE 3 — User Agent Planner (Missing Field Detection)

**Goal**: Agent pauses and asks user for missing information before executing tasks.

**Reuse**: PlannerAgent, WebsiteContext form data, CoordinatorAgent, workflowExecutions

**New Logic**: Add "gather_info" action type to PlannerAgent prompt. Add missingFields payload to SSE. resumeExecution path handles filled data.

**Modify**: agents/planner.ts, agents/coordinator.ts, routes/widget-public.ts

---

### PHASE 4 — Multi-Step Task Execution Reliability

**Goal**: Execution is reliable, recovers from partial failures, shows progress.

**Reuse**: executionSteps table, VerificationAgent, retryCount, evaluateActionRisk()

**New**: Proper step progress SSE reporting. Connect agentSafety.evaluateActionRisk() to Coordinator. Frontend step progress UI.

**Modify**: agents/coordinator.ts, routes/widget-public.ts

---

### PHASE 5 — User Clarification and Task State

**Goal**: Full multi-turn task state. Agent pauses intelligently and resumes correctly.

**Depends on**: Phase 3 and 4

**New**: `services/task-state-manager.ts`

---

### PHASE 6 — Action Verification and Safe Recovery

**Goal**: Agent verifies each action result and recovers gracefully from failures.

**Reuse**: VerificationAgent, agentSafety.ts, executionSteps.retryCount

**Enhance**: Semantic verification via LLM post-action check

---

### PHASE 7 — Reliability and Monitoring

**Goal**: Automated alerts, health monitoring, BullMQ health endpoint.

**New**: `services/notification-dispatcher.ts`, notifications migration

**Modify**: routes/system/index.ts (BullMQ health), routes/super-admin/index.ts (alert config)

---

### PHASE 8 — Notification Architecture

**Goal**: Project owners receive meaningful real-time notifications.

**Reuse**: Lead signals (already captured), knowledge gap counts, usageEvents

**New**: In-app notification bell, webhook delivery, configurable triggers

---

### PHASE 9 — UI/UX Upgrade

**Goal**: Dashboard with live push, agent execution visibility, full BI capability.

**Reuse**: All dashboard components, analytics data model

**Enhance**: WebSocket/SSE for live stream, agent task progress timeline, workflow visualization

---

## 12. Reusable Components Inventory

| Component | Location | Reusable For |
|---|---|---|
| assertPublicHttpUrl() | services/knowledge.ts:91 | Crawler SSRF protection |
| extractLinks() | services/knowledge.ts:150 | Link discovery from HTML |
| extractSourceContent() | services/knowledge.ts:741 | Per-URL content extraction for crawler |
| processKnowledgeSource() | services/knowledge.ts:973 | Chunk, embed, store crawled pages |
| searchProjectKnowledge() | services/knowledge.ts:503 | RAG for all AI features |
| contextFuser.fuse() | services/context-engine/context-fuser.ts | Combines live + KB context |
| UniversalProviderAdapter | services/llm-provider.ts | Any AI feature needing multi-provider |
| checkAndIncrementUsage() | security/quota.ts | All new billable features |
| checkProjectEntitlement() | security/entitlement.ts | Any new protected feature |
| validateWidgetOrigin() | security/domain.ts | Any public-facing endpoint |
| evaluateActionRisk() | security/agentSafety.ts | Agent risk gate (needs wiring) |
| buildStructuredPrompt() | security/promptBoundary.ts | Any LLM call with untrusted content |
| redactSensitiveContext() | security/sensitiveData.ts | Pre-LLM sanitization |
| logSecurityEvent() | security/middleware.ts | All new sensitive operations |
| authorizeMembership() | middlewares/authorizeMembership.ts | All new project-owner API routes |
| executeWithRetry() | routes/widget-public.ts:55 | Any external API call |
| BullMQ infrastructure | services/whatsapp/ | Crawl queue, notification queue |
| SessionMemoryStore | services/context-engine/session-memory.ts | Per-session agent state |

---

## 13. Files Likely to Be Modified Per Phase

### Phase 1
- `database/db/drizzle/` — NEW migration file (0008_xxx.sql)
- `agents/coordinator.ts` — connect evaluateActionRisk
- `routes/widget-public.ts` — gate Coordinator invocation, adjust knowledge gap condition

### Phase 2
- `services/knowledge.ts` — add multi-page crawl entry point
- `routes/projects/index.ts` — add POST /:projectId/crawl endpoint
- NEW: `services/website-crawler.ts`

### Phase 3-4
- `agents/planner.ts` — add gather_info action type
- `agents/coordinator.ts` — handle clarification steps, add risk gate
- `routes/widget-public.ts` — pass clarification responses through SSE

### Phase 7
- `routes/system/index.ts` — BullMQ health check
- `routes/super-admin/index.ts` — error alert configuration
- NEW: `services/notification-dispatcher.ts`

---

## Final Summary

### CURRENTLY WORKING
- Authentication (Supabase JWT + DB user + org membership)
- Organization and project isolation (RLS + all middleware guards)
- Widget Studio (full visual editor, CSS customizer, domain restriction)
- RAG Knowledge Base (vector + keyword, multi-format ingestion)
- Context Engine v2 (live DOM context from widget, delta reconstruction, session memory)
- AI Provider routing (Gemini, OpenAI, Claude, Groq, DeepSeek, OpenRouter + fallback chain)
- API health monitoring (health scores, latency, per-error cooldowns)
- Quota tracking and enforcement
- Trial system (atomic init, configurable, race-safe)
- Subscription and license management (schema + admin approval flow)
- Allowed domain enforcement for public widget
- Security foundation (all 16 security modules documented above)
- Agent architecture (Coordinator -> Planner -> SecurityAgent -> VerificationAgent, step persistence)
- Lead capture and intent scoring (hooked into widget message flow)
- Frequent question tracking (schema + service + connected)
- Knowledge gap detection (schema + service + connected to widget flow)
- Analytics dashboard (project-owner UI with all 5 tabs + CSV export)
- Super-admin dashboard (users, projects, payments, entitlements, errors)
- WhatsApp integration (schema + routes + BullMQ queue)

---

### PARTIALLY WORKING
- Website scraping: single-URL only; no JS rendering; no crawling; no change detection
- Agent action execution: backend plans and delivers via SSE; client widget must execute (JS widget execution not fully verified)
- Error monitoring: system_errors table exists but auto-insertion not wired up
- Live stream dashboard: polling only, no real-time push
- Risk classification: evaluateActionRisk() exists in agentSafety.ts but NOT connected to CoordinatorAgent

---

### NOT YET IMPLEMENTED
- Multi-page website crawling
- Notification system (email, webhook, in-app)
- User clarification capability in agent tasks
- Scheduled re-crawl and content freshness
- Server-side Puppeteer crawling/execution
- BullMQ/Redis health endpoint
- Circuit breaker for sustained provider failures

---

### IMPLEMENTED BUT NEEDS INTEGRATION
- **CRITICAL**: Database migration for `frequent_questions` table and new `widget_leads`/`knowledge_gaps` columns is MISSING — will cause runtime errors in any environment without manual DB updates
- `agentSafety.evaluateActionRisk()` implemented but not wired to `CoordinatorAgent`
- `CoordinatorAgent` runs on every chat message even for pure Q&A (performance/cost issue)

---

### INFORMATION NEEDED FROM OWNER
1. Website crawler scope: entire site vs. sitemap-only vs. user-defined URL patterns vs. AI-selected pages
2. Agent execution model: client-side widget only (current) vs. server-side Puppeteer vs. both modes
3. Missing field clarification UX: one question at a time in chat vs. inline form vs. all fields at once
4. Notification delivery channels: in-app only vs. email vs. webhook vs. SMS
5. Knowledge gap threshold: only AI-explicit fallback text vs. also no-RAG-match (current, noisier)

---

### RECOMMENDED NEXT SINGLE IMPLEMENTATION TASK

**Generate and apply a Drizzle database migration** covering:
1. New `frequent_questions` table (with unique index on project_id + normalized_question)
2. New columns on `widget_leads`: company, session_id, source_page_url, user_intent, status, score, score_value, notes, updated_at
3. New columns on `knowledge_gaps`: normalized_question, source_url, session_id, confidence, reason

**Rationale**: Without this migration, all newly implemented services (`lead-detection.ts`, `question-normalization.ts`, `unanswered-questions.ts`) and the upgraded analytics endpoint will throw database column-not-found errors at runtime. This is the single blocking prerequisite that prevents all Phase 1 features from working in production.
