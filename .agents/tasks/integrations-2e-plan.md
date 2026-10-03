# NOVA Business AI — Authorized Integrations 2E
# Final Production Verification: Inspection Report + Fix Plan

**Status at inspection time: YELLOW — 4 production blockers found**
**Live provider execution: UNVERIFIED — no Shopify credentials in `.env`**

---

## 1. Files Inspected

| File | Purpose |
|---|---|
| `database/db/src/schema/index.ts` (lines 991–1036) | `projectIntegrations` + `integrationTools` schema |
| `database/db/drizzle/0008_lean_tusk.sql` (lines 52–212) | Integration tables migration + FK constraints + indexes |
| `database/db/drizzle/0007_bent_pretty_boy.sql` (lines 39–47) | `enterprise_audit_logs` migration |
| `database/db/src/crypto.ts` | AES-256-GCM credential encryption/decryption |
| `database/db/src/index.ts` | `withTenantContext`, `withBypassRLS`, DB pool |
| `backend/api-server/src/services/integrations/provider-registry.ts` | `ProviderRegistry` class + `providerRegistry` singleton |
| `backend/api-server/src/services/integrations/providers/shopify.ts` | `ShopifyProvider` — SSRF, tools, execution |
| `backend/api-server/src/services/tool-execution.ts` | `executeServerTool` — full execution pipeline |
| `backend/api-server/src/routes/projects/integrations.ts` | Integration lifecycle CRUD API routes |
| `backend/api-server/src/routes/projects/tools.ts` | Tool execution route (`/:toolId/execute`) |
| `backend/api-server/src/routes/projects/index.ts` (lines 1201–1206) | Route mounting for integrations + tools subrouters |
| `backend/api-server/src/security/entitlement.ts` | `checkProjectEntitlement` |
| `backend/api-server/src/security/quota.ts` | `checkAndIncrementUsage`, `refundUsage` |
| `backend/api-server/src/middlewares/supabaseAuth.ts` | Auth middleware — sets `req.auth`, not `req.user` |
| `backend/api-server/src/middlewares/authorizeMembership.ts` | `authorizeMembership` middleware |
| `backend/api-server/src/middlewares/entitlementMiddleware.ts` | `entitlementMiddleware` |
| `backend/api-server/src/app.ts` (lines 147–157) | Rate limiters registered for integration/tool routes |
| `backend/api-server/src/routes/index.ts` | Global router — confirms integration subrouter is mounted |
| `scripts/enable-rls.mjs` | RLS bootstrap script — table list |
| `backend/api-server/tests/tenant-isolation.test.ts` | Unit test: project-level tenant isolation (mock) |
| `backend/api-server/tests/rls-cross-tenant-verification.ts` | Live DB RLS context verification |
| `backend/api-server/tests/phase2f-verification.test.ts` | Phase 2F security/confirmation test suite |
| `frontend/chat-app/src/components/project/integrations/IntegrationsList.tsx` | Frontend integration management UI |
| `frontend/chat-app/src/components/project/integrations/ShopifyConnectDialog.tsx` | Frontend Shopify connect dialog |
| `.env` (keys only, no values) | Environment variables — key names checked |

---

## 2. Security Property Verification Results

| # | Property | Status | File + Line Range |
|---|---|---|---|
| 1 | Project A cannot access Project B integrations | ✅ PRESENT | `integrations.ts` L27–35: `withTenantContext(orgId)` + project ownership check; `tool-execution.ts` L108–122: `projectId` filter on all DB queries |
| 2 | Organization A cannot access Organization B integrations | ✅ PRESENT | `tool-execution.ts` L123–129: `orgId && project.organizationId !== orgId` → FORBIDDEN |
| 3 | User without project membership cannot execute tools | ✅ PRESENT | `tool-execution.ts` L131–143: `organizationMembers` lookup; `supabaseAuth.ts` L85–138: auth required for all `/api` routes |
| 4 | Unauthorized role cannot execute restricted actions | ⚠️ PARTIAL | `integrations.ts` L207, L259: only checks `req.user.role === "viewer"` — BUT `req.user` is undefined (see Blocker #1). RBAC check effectively never runs. |
| 5 | Tool must belong to the requested project | ✅ PRESENT | `tool-execution.ts` L155–162: `and(eq(integrationTools.id, toolId), eq(integrationTools.projectId, projectId))` |
| 6 | Integration must belong to the requested project | ✅ PRESENT | `tool-execution.ts` L175–181: `and(eq(projectIntegrations.id, ...), eq(projectIntegrations.projectId, projectId))` |
| 7 | Credential must belong to the requested integration | ✅ PRESENT | `tool-execution.ts` L183–192: integration fetched via FK, `projectId`-scoped |
| 8 | Credential is decrypted ONLY server-side | ✅ PRESENT | `tool-execution.ts` L328–334: `crypto.decrypt()` inside server function; never sent to frontend |
| 9 | Credential is NEVER returned to frontend | ✅ PRESENT | `integrations.ts` L39–47: `hasCredentials: !!item.encryptedCredentials` only; raw credential stripped |
| 10 | Credential NEVER in logs/errors/audit/LLM/results | ✅ PRESENT | `tool-execution.ts` L381–410: `stripSensitive()` sanitizes `accessToken`, `access_token`, `api_key`, etc. from results; audit log only stores `toolId`, `actionName`, `providerName` |
| 11 | Tool execution validates provider + tool identity | ✅ PRESENT | `tool-execution.ts` L344–352: `providerRegistry.getProvider(providerName)` throws if unknown |
| 12 | Arbitrary provider/tool names are rejected | ✅ PRESENT | `integrations.ts` L78–80: `providerRegistry.hasProvider(provider)` check on connect; `tool-execution.ts` L344+: registry lookup throws on unknown |
| 13 | Arbitrary URLs not accepted by execution endpoint | ✅ PRESENT | `shopify.ts` L9–14: only `.myshopify.com` domains accepted; URL built from stored `shop` field, not user input |
| 14 | SSRF protection active | ✅ PRESENT | `shopify.ts` L8–31: `isSsrfSafe()` — domain allow-list + DNS resolution + private IP block; L33–47: `safeFetch()` — `redirect: "manual"`, redirect rejection |
| 15 | RLS is fail-closed | ⚠️ PARTIAL | `withTenantContext` validates non-empty orgId (throws). BUT `project_integrations` and `integration_tools` tables are **NOT in `enable-rls.mjs`** table list — RLS not enabled on those tables. |

---

## 3. Shopify Provider Verification

| Property | Status | Detail |
|---|---|---|
| `shopify_get_products` registered as tool | ❌ BROKEN | `ShopifyProvider.getAvailableTools()` returns it, but `providerRegistry.register(new ShopifyProvider())` is **never called** in the production code path. Import side-effect in `integrations.ts` imports the class but no self-registration occurs. |
| `shopify_get_orders` registered as tool | ❌ BROKEN | Same root cause as above |
| Correct provider | ✅ | `providerId = "shopify"`, matches stored `provider` column |
| Correct API endpoint | ✅ | `https://${shop}/admin/api/2024-01/products.json` and `orders.json` |
| Correct authentication | ✅ | `X-Shopify-Access-Token` header |
| Timeout | ❌ MISSING | No `AbortController` / timeout set on `safeFetch`. If Shopify API hangs, the request hangs indefinitely. |
| Safe error handling | ✅ | `try/catch` + `refundUsage` on failure |
| Response normalization | ✅ | Returns `{ products: [...] }` / `{ orders: [...] }` |
| No secret leakage | ✅ | `stripSensitive()` post-processes result |
| Audit logging | ✅ | `executeServerTool` writes `TOOL_EXECUTION_SUCCESS` / `TOOL_EXECUTION_FAILED` |
| Risk classification READ_ONLY | ✅ | Both tools have `riskLevel: "READ_ONLY"` in `ToolDefinition` |
| SSRF protection | ✅ | `.myshopify.com` domain enforcement + DNS check |

---

## 4. Lifecycle Verification

### Integration Lifecycle

| State | Status | Detail |
|---|---|---|
| `NOT_CONNECTED` | ✅ | Default in schema |
| `CONNECTING` | ❌ MISSING | No state or code represents this; connect goes directly `NOT_CONNECTED → CONNECTED` |
| `CONNECTED` | ✅ | Set on `/connect` route |
| `VERIFIED` | ✅ | Set on `/verify` route |
| `AUTHORIZED` | ✅ | Set on `/authorize` route; guards `status !== "VERIFIED"` before allowing |
| `HEALTH_CHECK_FAILED` | ✅ | Set if `verifyCredentials` returns false |
| `REVOKED` | ✅ | Set on `/revoke` route; credentials wiped |
| `DISCONNECTED` | ❌ MISSING | No `/disconnect` endpoint; no way to reach this state |

### Tool Lifecycle

| State | Status | Detail |
|---|---|---|
| `DISCOVERED` | ✅ | Set when tools seeded on `/connect` |
| `VERIFIED` | ✅ | Set when integration passes verification |
| `AUTHORIZED` | ❌ MISSING | Tool state jumps from `VERIFIED` directly to `EXECUTABLE`. `AUTHORIZED` step is skipped at the tool level. |
| `EXECUTABLE` | ✅ | Set when integration is authorized |
| `UNAVAILABLE` | ✅ | Set when integration is revoked |

### Invalid Transition Enforcement

| Transition | Status | Detail |
|---|---|---|
| DISCOVERED → EXECUTABLE (must be rejected) | ✅ | `authorize` enforces `integration.status !== "VERIFIED"` check |
| CONNECTED → AUTHORIZED (must be rejected) | ✅ | Same check blocks this |
| Tool non-EXECUTABLE execution blocked | ✅ | `tool-execution.ts` L167–171: `matchedTool.status !== "EXECUTABLE"` → FORBIDDEN |

---

## 5. Entitlement / Quota Verification

| Case | Status | File + Line Range |
|---|---|---|
| Active entitlement + quota available → execution allowed | ✅ | `entitlement.ts` L89–102 (SUBSCRIPTION_ACTIVE); `quota.ts` L75–108 (within limits) |
| Expired entitlement → blocked | ✅ | `entitlement.ts` L159–174 (TRIAL_EXPIRED → `allowed: false`) |
| Quota exhausted → blocked | ✅ | `quota.ts` L109–117 (current + quantity > limit → `allowed: false`) |
| No bypass path | ✅ | Super-admin bypass is intentional and correctly gated on DB role check |
| Concurrent quota race condition prevented | ✅ | `quota.ts` L118–143: conditional UPDATE with SQL constraint prevents over-increment |
| `refundUsage` on execution failure | ⚠️ PARTIAL | `tool-execution.ts` L411–413: uses `const { refundUsage } = require(...)` — dynamic `require()` in ESM/TypeScript context is a runtime error risk. Should be a top-level import. |

---

## 6. Risk Classification Verification

| Risk Level | Status | Detail |
|---|---|---|
| `READ_ONLY` | ✅ | Defined in `provider-registry.ts` `ToolDefinition` interface |
| `LOW_RISK_WRITE` | ✅ | Defined in interface |
| `HIGH_RISK_WRITE` | ✅ | Defined in interface; triggers confirmation token flow |
| `IRREVERSIBLE` | ✅ | Defined in interface; triggers confirmation token flow |
| `shopify_get_products` = READ_ONLY | ✅ | `shopify.ts` L82 |
| `shopify_get_orders` = READ_ONLY | ✅ | `shopify.ts` L93 |
| DB `riskLevel` + evaluatedRisk → server enforced | ✅ | `tool-execution.ts` L230–241: takes higher of the two |

---

## 7. Real Credential Availability

**ENCRYPTION_KEY**: NOT SET in `.env`. The `crypto.ts` module falls back to a hardcoded dummy key (`fallback_dummy_key_for_local_dev_only`). Any credentials encrypted with the fallback key will silently accept a decryption attempt and return the raw value if the format doesn't match, but more importantly the security property "credentials encrypted at rest with a production-strength key" is NOT MET.

**SHOPIFY credentials**: No `SHOPIFY_*` keys found in `.env`. No test integration fixture files found.

**Conclusion**: `LIVE_PROVIDER_EXECUTION = UNVERIFIED`. Final status cannot be GREEN.

---

## 8. Ordered Bugs and Blockers Found

### BLOCKER 1 — Critical: `req.user` is undefined in integration routes (integrations.ts, tools.ts)

`supabaseAuth.ts` sets `(req as any).auth = { userId, memberships, dbUser }`.
`integrations.ts` accesses `req.user.organizationId`, `req.user.id`, `req.user.role`.
`tools.ts` accesses `req.user?.organizationId`, `req.user?.id`.

`req.user` is never populated. Every call to these routes will either:
- Throw `TypeError: Cannot read properties of undefined (reading 'organizationId')`, returning a 400 error, OR
- Silently resolve `orgId = undefined`, which makes `withTenantContext(undefined)` throw "Missing organizationId"

**Effect**: The entire integration lifecycle (connect, verify, authorize, revoke) and tool execution route fail at runtime for all real requests.

### BLOCKER 2 — Critical: `ShopifyProvider` is never registered with `providerRegistry`

`shopify.ts` defines `ShopifyProvider` class but never calls `providerRegistry.register(new ShopifyProvider())`.
The side-effect import `import "../../services/integrations/providers/shopify"` in `integrations.ts` does nothing useful.

**Effect**: `providerRegistry.getProvider("shopify")` throws `Provider shopify not found in registry`. All Shopify tool executions fail. `verifyCredentials` called during `/verify` also fails.

### BLOCKER 3 — Security: `ENCRYPTION_KEY` not set in `.env`

`crypto.ts` falls back to `fallback_dummy_key_for_local_dev_only` when `ENCRYPTION_KEY` is absent.
This means integration credentials are encrypted at rest with a known, predictable key.
Any party with database access can trivially decrypt all stored credentials.

**Effect**: Credential encryption security property is not met. This must be set before any real credentials are stored.

### BLOCKER 4 — Security/RLS: `project_integrations` and `integration_tools` not in `enable-rls.mjs`

The RLS bootstrap script (`scripts/enable-rls.mjs`) does not include `project_integrations` or `integration_tools` in its table list. If this script was used to set up production RLS policies, these tables have RLS disabled. A direct DB connection (bypassing application auth) could read or write any tenant's integrations.

**Effect**: Database-level row isolation for integration data is not enforced.

### BUG 5 — Runtime error risk: `refundUsage` loaded with dynamic `require()` in ESM context

`tool-execution.ts` line 412: `const { refundUsage } = require("../../security/quota")`.
The rest of the file uses ESM `import` statements. Using `require()` inside an ESM module can fail at runtime depending on the build configuration, or silently suppress the refund if `require` resolves incorrectly.

**Effect**: Quota is not reliably refunded on execution failure, and the dynamic require may throw `ReferenceError: require is not defined` in pure ESM.

### BUG 6 — Missing: No request timeout on Shopify API calls

`shopify.ts` `safeFetch()` method has no `AbortController` or `signal` with a timeout. If the Shopify API is slow or unresponsive, tool executions will hang until Node's default socket timeout (usually minutes).

**Effect**: Slow/unresponsive provider causes request thread to block. Under load this can exhaust the server's connection pool.

### GAP 7 — Incomplete lifecycle: `CONNECTING` and `DISCONNECTED` states unreachable

The lifecycle spec requires `CONNECTING` (during credential validation) and `DISCONNECTED` (clean revocation). Neither is implemented. The connect route inserts directly with `CONNECTED` status. There is no disconnect endpoint.

**Effect**: Lifecycle is incomplete but does not cause runtime failures. The `AUTHORIZED` tool lifecycle state is also missing — tools jump directly from `VERIFIED` to `EXECUTABLE`.

### GAP 8 — Audit log missing structured fields (requestId, organizationId, duration)

`enterpriseAuditLogs` schema only has: `id`, `projectId`, `actionType`, `details` (jsonb), `timestamp`.
Required audit fields (`requestId`, `organizationId`, `duration`) are embedded in the `details` JSONB but not as typed columns. The `details` payload in `executeServerTool` does not include `requestId` or `duration`. The `securityAuditLogs` table has `requestId` but is not written during tool execution.

**Effect**: Audit records exist but lack structured fields needed for compliance queries and correlation. Not a production blocker but reduces auditability.

### GAP 9 — RBAC check in integrations routes relies on undefined `req.user.role`

The viewer role check in `authorize` and `revoke` (`req.user.role === "viewer"`) relies on `req.user` which is `undefined` (Blocker #1). Even after fixing Blocker #1, the role must be read from `req.auth.memberships` and resolved against the project's org. The current check is insufficient — it only checks a `role` field that doesn't exist on the auth context.

**Effect**: After fixing Blocker #1, viewer-role blocking in `authorize`/`revoke` will silently pass (undefined !== "viewer"), allowing any authenticated user to authorize/revoke integrations.

---

## 9. Ordered Fix List

### Fix 1 — Populate `req.user` from `req.auth` in integration and tool routes
**Files**: `backend/api-server/src/routes/projects/integrations.ts`

Replace all `req.user.organizationId`, `req.user.id`, `req.user.role` with values from `req.auth`:
- `orgId` → `(req as any).auth?.memberships?.[0]?.organizationId` (or resolved from projectId via withBypassRLS, as other routes do)
- `userId` → `(req as any).auth?.userId`
- Role check → resolve from `auth.memberships` against the project's org

Preferred pattern (already used throughout `projects/index.ts`):
```typescript
const orgId = req.auth?.memberships?.find(...)?.organizationId;
// or resolve via withBypassRLS(project lookup) then membership check
const userId = (req as any).auth?.userId;
const isSuperAdmin = (req as any).auth?.dbUser?.role === "super_admin";
```

**Verify**: Start the server; call `POST /api/projects/:projectId/integrations/connect` with a valid Bearer token. Should return 200/400 rather than 500.

### Fix 2 — Register ShopifyProvider with providerRegistry at module load
**Files**: `backend/api-server/src/services/integrations/providers/shopify.ts`

Add at the bottom of the file (after the class definition):
```typescript
import { providerRegistry } from "../provider-registry";
// Self-register on import
providerRegistry.register(new ShopifyProvider());
```

This makes the existing side-effect import `import "../../services/integrations/providers/shopify"` in `integrations.ts` correctly register the provider.

**Verify**: After fix, `providerRegistry.hasProvider("shopify")` returns `true`. The `/verify` and tool execution routes resolve the provider without throwing.

### Fix 3 — Add ENCRYPTION_KEY to .env.example and document requirement
**Files**: `.env.example`, `database/db/src/crypto.ts`

1. Add `ENCRYPTION_KEY=` to `.env.example` with a comment explaining it must be a strong random secret.
2. In `crypto.ts`, change the fallback to throw an error in production (`NODE_ENV === "production"`) rather than silently use the dummy key:
```typescript
if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV === "production") {
  throw new Error("ENCRYPTION_KEY must be set in production. Refusing to start with fallback key.");
}
```

**Note**: For local dev, the fallback remains. For production (Render), set `ENCRYPTION_KEY` as an environment variable.

**Verify**: Build passes. In production mode without ENCRYPTION_KEY, server fails to start with a clear error. With key set, credentials encrypt/decrypt correctly.

### Fix 4 — Add `project_integrations` and `integration_tools` to `enable-rls.mjs`
**Files**: `scripts/enable-rls.mjs`

Add both tables to the `tables` array:
```javascript
const tables = [
  // ... existing tables ...
  'project_integrations',
  'integration_tools',
  // ...
];
```

After deploying, run `node scripts/enable-rls.mjs` (with `DATABASE_URL` set) against the production database.

**Verify**: Query `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('project_integrations', 'integration_tools')` — both should show `relrowsecurity = true`.

### Fix 5 — Replace dynamic `require("../../security/quota")` with top-level import
**Files**: `backend/api-server/src/services/tool-execution.ts`

Move `refundUsage` into the top-level import at line 13:
```typescript
import { checkAndIncrementUsage, refundUsage } from "../security/quota";
```

Remove the inline `const { refundUsage } = require(...)` at line 412.

**Verify**: TypeScript compiles without error (`pnpm -F api-server build` or `npx tsx --check src/services/tool-execution.ts`). Quota refund logic is reachable.

### Fix 6 — Add request timeout to Shopify `safeFetch`
**Files**: `backend/api-server/src/services/integrations/providers/shopify.ts`

Add an `AbortController` timeout (10 seconds is standard for Shopify Admin API):
```typescript
private async safeFetch(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
  try {
    // ... existing SSRF check ...
    const safeOptions: RequestInit = {
      ...options,
      redirect: "manual",
      signal: controller.signal,
    };
    const response = await fetch(targetUrl.toString(), safeOptions);
    clearTimeout(timeoutId);
    if (response.status >= 300 && response.status < 400) {
      throw new Error("SSRF Protection: Redirects are not permitted for this provider.");
    }
    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("Provider timeout: Shopify API did not respond within 10 seconds.");
    }
    throw err;
  }
}
```

**Verify**: Build passes. A manual test against a slow endpoint (or mocked fetch timeout) returns a clear timeout error rather than hanging.

### Fix 7 — Fix RBAC role check in `authorize` and `revoke` routes
**Files**: `backend/api-server/src/routes/projects/integrations.ts`

Replace the broken `req.user.role === "viewer"` check with a proper membership role resolution (same pattern used in `projects/index.ts`):
```typescript
const isSuperAdmin = (req as any).auth?.dbUser?.role === "super_admin";
// Resolve org membership
const effectiveOrgId = orgId || project?.organizationId;
const membership = (req as any).auth?.memberships?.find(
  (m: any) => m.organizationId === effectiveOrgId
);
const userRole = membership?.role || "viewer";
if (!isSuperAdmin && (!membership || !["owner", "admin", "manager"].includes(userRole))) {
  return res.status(403).json({ error: "Insufficient permissions to authorize integrations" });
}
```

This requires the project to be fetched first (already done inside `withTenantContext` for these routes — extract `orgId` from the project record, or use `withBypassRLS` first as the pattern in `projects/index.ts`).

**Verify**: A viewer-role user calling `/authorize` or `/revoke` receives 403. An owner-role user can proceed.

### Fix 8 — Add `requestId` and `duration` to execution audit log entries
**Files**: `backend/api-server/src/services/tool-execution.ts`

Capture execution start time at the top of `executeServerTool` and include `requestId` (from caller or generated) in the audit log details:
```typescript
const executionStart = Date.now();
// ... existing code ...
// In audit log insert:
await db.insert(enterpriseAuditLogs).values({
  projectId,
  actionType: isVerified ? "TOOL_EXECUTION_SUCCESS" : "TOOL_EXECUTION_FAILED",
  details: {
    toolId: matchedTool.id,
    actionName: resolvedActionName,
    providerName,
    userId,
    organizationId: effectiveOrgId,
    requestId: executionId || crypto.randomUUID(),
    status: isVerified ? "SUCCESS" : "FAILED",
    riskLevel: serverRiskLevel,
    durationMs: Date.now() - executionStart,
    error: executionError || verRes.data?.reason || null
  }
});
```

**Verify**: Run a tool execution; query `enterprise_audit_logs` and confirm `details` contains `requestId`, `organizationId`, and `durationMs`.

---

## 10. Whether Live Provider Execution is Possible

**LIVE_PROVIDER_EXECUTION = UNVERIFIED**

No Shopify credentials are present in `.env`. No test integration fixture or seed file was found.

To enable live execution for testing:
1. Complete Fixes 1–3 first (the system cannot execute without them).
2. Create a Shopify Partner account with a development store.
3. Generate an Admin API access token with `read_products` and `read_orders` scopes.
4. Connect the integration via the frontend UI or API:
   `POST /api/projects/{projectId}/integrations/connect` with `{ provider: "shopify", credentials: { shop: "...", accessToken: "..." } }`
5. Run the lifecycle: `verify` → `authorize`.
6. Execute via: `POST /api/projects/{projectId}/tools/{toolId}/execute`

The execution path, once Blockers 1–2 are fixed, is fully wired end-to-end and will produce real Shopify API results with audit logging.

---

## 11. Summary: Prioritized Fix Order

| Priority | Fix | Severity | Status |
|---|---|---|---|
| 1 | Fix `req.user` → `req.auth` in integrations.ts | 🔴 BLOCKER | Runtime crash on every request |
| 2 | Register ShopifyProvider in providerRegistry | 🔴 BLOCKER | All tool operations fail |
| 3 | Set ENCRYPTION_KEY + production guard | 🔴 SECURITY BLOCKER | Credentials unprotected |
| 4 | Add integration tables to enable-rls.mjs | 🔴 SECURITY BLOCKER | No DB-level isolation |
| 5 | Fix `require()` → `import` for refundUsage | 🟡 BUG | Quota refund may fail |
| 6 | RBAC role check fix | 🟡 BUG | Viewers can authorize/revoke |
| 7 | Add Shopify API timeout | 🟡 BUG | Potential request hang |
| 8 | Add requestId/duration to audit log | 🟢 GAP | Auditability improvement |

**Final Status: YELLOW**
Fixes 1–4 are required before the system can be used or claimed as production-ready. Fixes 5–8 are required before the status can advance to GREEN. Live provider execution requires real Shopify credentials (outside the code).
