# Production Implementation Report: Lead Capture, Project Analytics, & BI Foundation

## Executive Summary
This report documents the design, architecture, and implementation of the **Lead Capture, Project Analytics, and Business Intelligence Foundation** for the Chatbot/Widget Studio SaaS platform.

The system turns individual project chatbots into automated lead-generation and business intelligence engines for project owners. Each project owner receives useful insights into visitor questions, high-intent leads, knowledge gaps, and widget engagement—with strict multi-tenant data isolation and privacy protection.

---

## 1. Existing Architecture Discovered & Reused

| Component | Existing Resource Reused | Upgrade / Integration Applied |
| :--- | :--- | :--- |
| **Database Tables** | `widget_leads`, `knowledge_gaps`, `widget_analytics`, `chat_sessions`, `messages` | Extended `widget_leads` & `knowledge_gaps` without breaking existing schemas. Created `frequent_questions`. |
| **Authentication & AuthZ** | `supabaseAuthMiddleware`, `authorizeMembership` | Attached `authorizeMembership("viewer")` middleware to all project widget/leads/analytics routes to enforce `organization → project → data` isolation. |
| **Security Foundation** | `prompt-firewall`, `validateWidgetOrigin`, `checkProjectEntitlement`, `sendSafeError` | Reused existing security guards and rate limiting without duplicating security modules. |
| **Widget Engine** | `backend/api-server/src/routes/widget-public.ts` | Hooked lead detection, question normalization, and unanswered question tracking into public widget message flow. |

---

## 2. Files Modified & Created

### Files Created
- `backend/api-server/src/services/lead-detection.ts`: Configurable intent detection, lead scoring engine (Pricing +30, Demo +40, Quote/Contact +40, Purchase +50, Contact Info +50), and duplicate lead merging.
- `backend/api-server/src/services/question-normalization.ts`: Safe question normalization algorithm (lowercase, trim whitespace, punctuation stripping, phrasing normalization) and frequent questions tracking.
- `backend/api-server/src/services/unanswered-questions.ts`: Knowledge gap tracking service (signal validation for low confidence/fallback/unhelpful responses while ignoring temporary API errors).
- `backend/api-server/src/scripts/test-lead-analytics.ts`: Automated test suite verifying intent scoring, normalization, fallback detection, formula sanitization, and zero-data safety.
- `docs/production/lead-analytics-implementation-report.md`: Implementation report and architecture documentation.

### Files Modified
- `database/db/src/schema/index.ts`: Extended `widgetLeads` & `knowledgeGaps` tables and added `frequentQuestions` table and relations.
- `backend/api-server/src/routes/widget-public.ts`: Integrated background lead capture, question tracking, knowledge gap recording, and enhanced public lead submission endpoint.
- `backend/api-server/src/routes/projects/widget.ts`: Enforced `authorizeMembership("viewer")` access control; added APIs for analytics, leads CRUD, status/score updates, top questions, unanswered questions, and gap resolution.
- `frontend/chat-app/src/components/project/analytics.tsx`: Updated project dashboard UI with Overview, FAQs, Knowledge Gaps, Lead Status/Score management, Live Stream, and Formula-Sanitized CSV export.
- `backend/api-server/package.json`: Added test script entry `test:lead-analytics`.
- `task.md`: Updated task execution state.

---

## 3. Database Schema Changes

### `widget_leads` (Extended)
- `company`: `varchar(255)`
- `session_id`: `uuid` (FK `chat_sessions.id`)
- `source_page_url`: `text`
- `user_intent`: `text`
- `status`: `varchar(50)` (`NEW`, `CONTACTED`, `QUALIFIED`, `CONVERTED`, `LOST`) - default `NEW`
- `score`: `varchar(50)` (`LOW`, `MEDIUM`, `HIGH`) - default `MEDIUM`
- `score_value`: `integer` - default `50`
- `notes`: `text`
- `updated_at`: `timestamp`

### `frequent_questions` (New Table)
- `id`: `uuid` (PK)
- `project_id`: `uuid` (FK `projects.id`)
- `question_text`: `text`
- `normalized_question`: `text`
- `category`: `varchar(100)`
- `intent`: `varchar(100)`
- `count`: `integer`
- `last_asked_at`: `timestamp`
- `created_at`: `timestamp`
- `updated_at`: `timestamp`
- Unique index on `(project_id, normalized_question)` for efficient atomic upserts.

### `knowledge_gaps` (Extended)
- `normalized_question`: `text`
- `source_url`: `text`
- `session_id`: `uuid` (FK `chat_sessions.id`)
- `confidence`: `varchar(50)`
- `reason`: `varchar(100)` (`NO_RAG_MATCH`, `LOW_CONFIDENCE`, `AI_FALLBACK`, `EXPLICIT_UNKNOWN`)

---

## 4. API Endpoints Summary

| Method | Endpoint Path | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/projects/:projectId/widget/analytics` | Project Viewer+ | Fetches isolated BI metrics (Conversations, Messages, Visitors, Leads, High-intent leads, Conversion rate, Latency, FAQs, Knowledge gaps, Time-series). |
| `GET` | `/api/projects/:projectId/widget/leads` | Project Viewer+ | Fetches project leads list. |
| `POST` | `/api/projects/:projectId/widget/leads` | Project Viewer+ | Manually creates a new lead entry. |
| `PATCH` | `/api/projects/:projectId/widget/leads/:leadId` | Project Viewer+ | Updates lead status, score, notes, company, email, or phone. |
| `DELETE` | `/api/projects/:projectId/widget/leads/:leadId` | Project Viewer+ | Deletes a lead belonging to the project. |
| `GET` | `/api/projects/:projectId/widget/top-questions` | Project Viewer+ | Returns top frequent questions for the project. |
| `GET` | `/api/projects/:projectId/widget/unanswered-questions` | Project Viewer+ | Returns recorded knowledge gaps for the project. |
| `PATCH` | `/api/projects/:projectId/widget/unanswered-questions/:gapId/resolve` | Project Viewer+ | Marks a knowledge gap as resolved. |
| `POST` | `/api/widget/:widgetToken/leads` | Public Widget | Public lead submission endpoint with intent scoring and deduplication. |

---

## 5. Security & Ownership Isolation

1. **Strict Multi-Tenant Isolation**:
   - Backend routes enforce `authorizeMembership("viewer")`, which resolves the project's `organizationId` and checks the user's active organization membership.
   - All queries filter strictly by `eq(table.projectId, projectId)`.
   - Project A users receive `403 Forbidden` if attempting to request Project B endpoints by altering `projectId` URL parameters.

2. **Data Minimization & Formula Injection Protection**:
   - Sensitive AI keys, cookies, tokens, and internal prompts are never exposed in analytics payloads.
   - CSV Export sanitizes all cells starting with formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) by prepending a single quote `'`.

---

## 6. Verification Results

| Verification Category | Status | Details |
| :--- | :--- | :--- |
| **Lead Signal & Scoring** | PASSED | `detectLeadSignals` correctly extracts email, phone, pricing/demo/quote intents, and assigns correct `LOW/MEDIUM/HIGH` score. |
| **Question Normalization** | PASSED | `normalizeQuestion` handles lowercasing, punctuation removal, contraction expansion, and category tagging. |
| **Knowledge Gap Tracking** | PASSED | `isFallbackResponse` correctly identifies AI fallback text and excludes temporary 500/503 system errors. |
| **Formula Sanitization** | PASSED | Formula triggers (`=SUM(...)`, `@cmd...`) prepended with `'` during CSV generation. |
| **Zero-Data State Safety** | PASSED | Analytics dashboard displays clean `0.0%` conversion rate and zero states without division-by-zero crashes. |
| **Tenant Isolation** | PASSED | Route guards enforce project membership checks on all endpoints. |

---

## 7. Known Limitations & Future Improvements
1. **Semantic Vector Clustering**:
   - The current question normalization uses rule-based string cleaning. The database schema stores both `questionText` and `normalizedQuestion`, allowing vector cosine similarity clustering to be added seamlessly in the future.
2. **AI Lead Qualification Agent**:
   - The initial lead scoring engine is deterministic. The `score` and `scoreValue` structure is extensible for LLM-driven conversation qualification.
