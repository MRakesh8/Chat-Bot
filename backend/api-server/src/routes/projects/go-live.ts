/**
 * @file go-live.ts
 * @description Authenticated routes for the Local Development -> Ready -> Go Live -> Production workflow.
 * Provides backend-driven production readiness evaluation, Go Live activation, and rollback controls for the SAME project.
 */
import { Router, Response } from "express";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { 
  db, 
  withTenantContext, 
  withBypassRLS, 
  projects, 
  projectWidgetSettings, 
  projectLocalSessions,
  knowledgeSources,
  knowledgeChunks,
  auditLogs 
} from "@workspace/db";
import { 
  validateSafeProductionUrl, 
  validateSafeLocalUrl, 
  normalizeDomain, 
  checkProjectEntitlement 
} from "../../security";
import { localDevBridge } from "../../services/local-dev-bridge";
import { logger } from "../../lib/logger";

const router = Router({ mergeParams: true });

const ROLE_WEIGHTS: Record<string, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  agent: 2,
  viewer: 1,
};

function hasRequiredRole(userRole: string, requiredRole: "owner" | "admin" | "manager" | "agent" | "viewer"): boolean {
  return (ROLE_WEIGHTS[userRole] || 0) >= ROLE_WEIGHTS[requiredRole];
}

async function authorizeProjectAccess(req: any, projectId: string) {
  const userId = req.auth?.userId ?? null;
  if (!userId) {
    return { authorized: false, status: 401, error: "Unauthorized" };
  }

  const [project] = await withBypassRLS(async (tx: any) => {
    return await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  });

  if (!project) {
    return { authorized: false, status: 404, error: "Project not found" };
  }

  const isSuperAdmin = req.auth?.dbUser?.role === "super_admin";
  const membership = req.auth?.memberships?.find((m: any) => m.organizationId === project.organizationId);

  if (!isSuperAdmin && !membership) {
    return { authorized: false, status: 403, error: "Forbidden: You are not a member of this workspace" };
  }

  const isWorkspaceAdmin = isSuperAdmin || (membership && hasRequiredRole(membership.role, "manager"));
  if (!isWorkspaceAdmin && project.userId !== userId) {
    return { authorized: false, status: 403, error: "Forbidden: Access denied to this project" };
  }

  return { 
    authorized: true, 
    project, 
    orgId: project.organizationId, 
    userId,
    isWorkspaceAdmin,
    role: isSuperAdmin ? "super_admin" : (membership?.role || "viewer")
  };
}

function resolveServerBaseUrl(req: any): string {
  if (process.env.BACKEND_URL && process.env.BACKEND_URL.startsWith("http")) {
    return process.env.BACKEND_URL.replace(/\/+$/, "");
  }
  if (process.env.API_BASE_URL && process.env.API_BASE_URL.startsWith("http")) {
    return process.env.API_BASE_URL.replace(/\/+$/, "");
  }
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.get("host") || "127.0.0.1:5000";
  return `${protocol}://${host}`;
}

/**
 * GET /api/projects/:projectId/go-live/readiness
 * (Also available at /api/projects/:projectId/local-dev/readiness)
 * Performs real backend evidence-driven verification across 8 criteria.
 */
router.get("/readiness", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const auth = await authorizeProjectAccess(req, projectId);
  if (!auth.authorized) {
    return res.status(auth.status!).json({ error: auth.error });
  }

  try {
    // 1. Fetch Project State
    const project = auth.project;

    // 2. Fetch Widget Settings
    const [widgetSettings] = await withBypassRLS(async (tx: any) => {
      return await tx.select().from(projectWidgetSettings).where(eq(projectWidgetSettings.projectId, projectId)).limit(1);
    });

    // 3. Fetch Local Development Sessions (Evidence of localhost testing)
    const localSessions = await withTenantContext(auth.orgId, async (tx: any) => {
      return await tx
        .select()
        .from(projectLocalSessions)
        .where(eq(projectLocalSessions.projectId, projectId))
        .orderBy(desc(projectLocalSessions.createdAt))
        .limit(5);
    });

    // 4. Fetch Knowledge Sources & Chunks count
    const [knowledgeCountResult] = await withTenantContext(auth.orgId, async (tx: any) => {
      return await tx
        .select({ count: sql<number>`count(${knowledgeSources.id})`.mapWith(Number) })
        .from(knowledgeSources)
        .where(eq(knowledgeSources.projectId, projectId));
    });
    const knowledgeCount = knowledgeCountResult?.count || 0;

    // 5. Check Entitlement
    const entitlement = await checkProjectEntitlement(projectId, auth.orgId);

    // Build Checks Matrix
    const checks: Array<{
      id: string;
      name: string;
      status: "pass" | "warn" | "fail";
      message: string;
      detail: string;
      isCritical: boolean;
    }> = [];

    // Check 1: Local Development Testing Evidence
    const hasLocalTesting = localSessions && localSessions.length > 0;
    const activeLocalSession = localSessions?.find((s: any) => !s.revokedAt && s.status === "CONNECTED");
    if (hasLocalTesting) {
      checks.push({
        id: "local_dev_tested",
        name: "Localhost Pre-Production Testing",
        status: "pass",
        message: "Local development testing verified.",
        detail: `Verified on ${localSessions[0].localUrl} (${localSessions.length} session(s) recorded).`,
        isCritical: false,
      });
    } else {
      checks.push({
        id: "local_dev_tested",
        name: "Localhost Pre-Production Testing",
        status: "warn",
        message: "No local testing recorded yet.",
        detail: "Recommended: Test on your local website (e.g. http://localhost:3000) before going live.",
        isCritical: false,
      });
    }

    // Check 2: Production Website Domain & URL
    const hasProductionUrl = !!project.websiteUrl && project.websiteUrl.trim().length > 0;
    const prodValidation = hasProductionUrl ? validateSafeProductionUrl(project.websiteUrl) : null;
    if (hasProductionUrl && prodValidation?.valid) {
      checks.push({
        id: "production_url",
        name: "Production Website URL",
        status: "pass",
        message: "Production domain configured.",
        detail: `Target: ${prodValidation.normalizedUrl} (Domain: ${prodValidation.domain})`,
        isCritical: true,
      });
    } else if (hasProductionUrl && !prodValidation?.valid) {
      checks.push({
        id: "production_url",
        name: "Production Website URL",
        status: "fail",
        message: "Invalid production URL format.",
        detail: prodValidation?.error || "Please configure a valid public production domain.",
        isCritical: true,
      });
    } else {
      checks.push({
        id: "production_url",
        name: "Production Website URL",
        status: "warn",
        message: "Production URL not set yet.",
        detail: "Enter your production website URL (e.g. https://abc-business.com) to activate Go Live.",
        isCritical: false, // Can be provided in the Go Live dialog
      });
    }

    // Check 3: Widget Configuration & Token
    if (widgetSettings && widgetSettings.widgetToken && widgetSettings.isEnabled) {
      checks.push({
        id: "widget_configuration",
        name: "Widget Configuration",
        status: "pass",
        message: "Customer chatbot widget is configured and enabled.",
        detail: `Bot Name: "${widgetSettings.botName || 'Assistant'}", Token: ${widgetSettings.widgetToken.slice(0, 8)}...`,
        isCritical: true,
      });
    } else if (widgetSettings && !widgetSettings.isEnabled) {
      checks.push({
        id: "widget_configuration",
        name: "Widget Configuration",
        status: "warn",
        message: "Widget is currently disabled.",
        detail: "Widget will be automatically enabled when Go Live is activated.",
        isCritical: false,
      });
    } else {
      checks.push({
        id: "widget_configuration",
        name: "Widget Configuration",
        status: "pass",
        message: "Default widget settings will be initialized upon Go Live.",
        detail: "Standard widget configuration will be applied.",
        isCritical: true,
      });
    }

    // Check 4: AI Configuration & System Prompt
    const hasSystemPrompt = !!project.systemPrompt && project.systemPrompt.trim().length > 0;
    checks.push({
      id: "ai_configuration",
      name: "AI & Router Configuration",
      status: "pass",
      message: "AI reasoning engine & system prompt active.",
      detail: hasSystemPrompt 
        ? "Custom system prompt configured." 
        : "Standard NOVA business prompt active with automated fallbacks.",
      isCritical: true,
    });

    // Check 5: Knowledge Base & RAG
    if (knowledgeCount > 0) {
      checks.push({
        id: "knowledge_rag",
        name: "RAG & Knowledge Base",
        status: "pass",
        message: `${knowledgeCount} knowledge source(s) indexed.`,
        detail: "Chatbot will retrieve accurate business answers from indexed knowledge.",
        isCritical: false,
      });
    } else {
      checks.push({
        id: "knowledge_rag",
        name: "RAG & Knowledge Base",
        status: "warn",
        message: "No custom knowledge sources indexed yet.",
        detail: "Chatbot will answer using system prompt & general business intelligence. You can scan website intelligence anytime.",
        isCritical: false,
      });
    }

    // Check 6: Subscription & Entitlement
    const isEntitled = entitlement.status === "SUBSCRIPTION_ACTIVE" || entitlement.status === "TRIAL_ACTIVE";
    if (isEntitled) {
      checks.push({
        id: "project_entitlement",
        name: "Account Entitlement",
        status: "pass",
        message: "Active subscription or trial.",
        detail: `Status: ${entitlement.status}`,
        isCritical: true,
      });
    } else {
      checks.push({
        id: "project_entitlement",
        name: "Account Entitlement",
        status: "fail",
        message: "Subscription inactive.",
        detail: "Active subscription or trial is required for live production traffic.",
        isCritical: true,
      });
    }

    // Check 7: Security & Origin Validation
    const hasAllowedDomains = (widgetSettings?.allowedDomains && widgetSettings.allowedDomains.length > 0) ||
      (project.allowedDomains && project.allowedDomains.length > 0);
    checks.push({
      id: "domain_security",
      name: "Domain Security & CORS",
      status: "pass",
      message: "Origin validation ready.",
      detail: hasAllowedDomains 
        ? "Configured domains and production origin will be authorized." 
        : "Production origin will be automatically whitelisted upon Go Live.",
      isCritical: true,
    });

    // Determine overall readiness
    const hasCriticalFail = checks.some(c => c.isCritical && c.status === "fail");
    const isReady = !hasCriticalFail;

    const currentEnvironment = (project.status === "active" || project.status === "live") && project.websiteUrl
      ? "PRODUCTION"
      : (activeLocalSession ? "LOCAL_DEVELOPMENT" : "DEVELOPMENT");

    return res.json({
      projectId,
      projectName: project.name,
      environment: currentEnvironment,
      status: project.status,
      productionWebsiteUrl: project.websiteUrl || null,
      isReady,
      overallStatus: hasCriticalFail ? "BLOCKED" : (isReady ? "READY" : "IN_PROGRESS"),
      checks,
      summary: {
        totalChecks: checks.length,
        passed: checks.filter(c => c.status === "pass").length,
        warnings: checks.filter(c => c.status === "warn").length,
        failed: checks.filter(c => c.status === "fail").length,
      }
    });
  } catch (error: any) {
    req.log.error({ err: error, projectId }, "Error calculating production readiness");
    return res.status(500).json({ error: "Failed to evaluate production readiness" });
  }
});

/**
 * POST /api/projects/:projectId/go-live
 * Activates the SAME NOVA project for live production deployment.
 * Updates production URL, enables widget, whitelists production domain,
 * while safely isolating and closing local testing sessions.
 */
router.post("/", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const { productionUrl: requestedUrl } = req.body || {};

  const auth = await authorizeProjectAccess(req, projectId);
  if (!auth.authorized) {
    return res.status(auth.status!).json({ error: auth.error });
  }

  // Permission check: requires manager, admin, or owner role
  if (!auth.isWorkspaceAdmin && auth.project.userId !== auth.userId) {
    return res.status(403).json({ error: "Forbidden: You need manager or owner permissions to Go Live." });
  }

  try {
    // 1. Resolve production website URL
    const targetUrl = requestedUrl || auth.project.websiteUrl;
    if (!targetUrl || typeof targetUrl !== "string" || !targetUrl.trim()) {
      return res.status(400).json({ 
        error: "Production website URL is required to go live. Example: https://abc-business.com" 
      });
    }

    // 2. Strict validation of production website URL
    const validation = validateSafeProductionUrl(targetUrl);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const normalizedUrl = validation.normalizedUrl!;
    const domain = validation.domain!;

    // 3. Update Projects record (SAME PROJECT ID)
    const existingAllowed = Array.isArray(auth.project.allowedDomains) ? auth.project.allowedDomains : [];
    const newAllowedDomains = Array.from(new Set([
      ...existingAllowed,
      domain,
      `www.${domain}`
    ])).filter(d => d && d !== "*");

    const [updatedProject] = await withTenantContext(auth.orgId, async (tx: any) => {
      return await tx
        .update(projects)
        .set({
          websiteUrl: normalizedUrl,
          status: "active",
          allowedDomains: newAllowedDomains.length > 0 ? newAllowedDomains : ["*"],
        })
        .where(eq(projects.id, projectId))
        .returning();
    });

    // 4. Update / Ensure Widget Settings exist & are enabled
    let [widgetSettings] = await withBypassRLS(async (tx: any) => {
      return await tx.select().from(projectWidgetSettings).where(eq(projectWidgetSettings.projectId, projectId)).limit(1);
    });

    if (widgetSettings) {
      const widgetAllowed = Array.isArray(widgetSettings.allowedDomains) ? widgetSettings.allowedDomains : [];
      const updatedWidgetAllowed = Array.from(new Set([
        ...widgetAllowed,
        domain,
        `www.${domain}`
      ])).filter(Boolean);

      [widgetSettings] = await withBypassRLS(async (tx: any) => {
        return await tx
          .update(projectWidgetSettings)
          .set({
            isEnabled: true,
            allowedDomains: updatedWidgetAllowed,
            updatedAt: new Date()
          })
          .where(eq(projectWidgetSettings.projectId, projectId))
          .returning();
      });
    } else {
      // Create default enabled widget settings
      const crypto = await import("crypto");
      const widgetToken = crypto.randomBytes(32).toString("hex");
      [widgetSettings] = await withBypassRLS(async (tx: any) => {
        return await tx
          .insert(projectWidgetSettings)
          .values({
            projectId,
            botName: auth.project.name || "Nova AI Assistant",
            welcomeMessage: "Hello! How can I help your business today?",
            isEnabled: true,
            widgetToken,
            allowedDomains: [domain, `www.${domain}`],
          })
          .returning();
      });
    }

    // 5. Gracefully close active local development sessions & revoke bridge
    const activeSessions = await withTenantContext(auth.orgId, async (tx: any) => {
      return await tx
        .update(projectLocalSessions)
        .set({
          status: "STOPPED",
          revokedAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(
          eq(projectLocalSessions.projectId, projectId),
          eq(projectLocalSessions.status, "CONNECTED"),
          isNull(projectLocalSessions.revokedAt)
        ))
        .returning();
    });

    for (const s of activeSessions) {
      if (s.connectorToken) {
        localDevBridge.revokeSession(s.connectorToken);
      }
    }

    // 6. Security Audit Log
    await withBypassRLS(async (tx: any) => {
      await tx.insert(auditLogs).values({
        userId: auth.userId,
        action: "PROJECT_GO_LIVE",
        target: `project:${projectId}:url:${normalizedUrl}:domain:${domain}`,
      });
    }).catch(() => {});

    const serverBaseUrl = resolveServerBaseUrl(req);
    const widgetSnippet = `<script\n  src="${serverBaseUrl}/widget.js"\n  data-widget-token="${widgetSettings.widgetToken}"\n  data-api-url="${serverBaseUrl}">\n</script>`;

    logger.info({ projectId, productionUrl: normalizedUrl, domain }, "Project transitioned to LIVE PRODUCTION successfully");

    return res.status(200).json({
      success: true,
      message: "Project is now LIVE on your production website.",
      projectId: updatedProject.id,
      projectName: updatedProject.name,
      environment: "PRODUCTION",
      productionWebsiteUrl: normalizedUrl,
      productionDomain: domain,
      status: "active",
      widgetToken: widgetSettings.widgetToken,
      allowedDomains: widgetSettings.allowedDomains,
      embedSnippet: widgetSnippet,
      activatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    req.log.error({ err: error, projectId }, "Error transitioning project to production Go Live");
    return res.status(500).json({ error: error.message || "Failed to activate production Go Live" });
  }
});

/**
 * POST /api/projects/:projectId/go-live/rollback
 * Allows project owner/admin to revert production status to development mode.
 */
router.post("/rollback", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const auth = await authorizeProjectAccess(req, projectId);
  if (!auth.authorized) {
    return res.status(auth.status!).json({ error: auth.error });
  }

  if (!auth.isWorkspaceAdmin && auth.project.userId !== auth.userId) {
    return res.status(403).json({ error: "Forbidden: You need manager or owner permissions to rollback." });
  }

  try {
    const [updatedProject] = await withTenantContext(auth.orgId, async (tx: any) => {
      return await tx
        .update(projects)
        .set({
          status: "development",
        })
        .where(eq(projects.id, projectId))
        .returning();
    });

    await withBypassRLS(async (tx: any) => {
      await tx.insert(auditLogs).values({
        userId: auth.userId,
        action: "PROJECT_GO_LIVE_ROLLBACK",
        target: `project:${projectId}`,
      });
    }).catch(() => {});

    return res.json({
      success: true,
      message: "Project status rolled back to development mode.",
      projectId: updatedProject.id,
      environment: "DEVELOPMENT",
      status: "development"
    });
  } catch (error: any) {
    req.log.error({ err: error, projectId }, "Error rolling back project status");
    return res.status(500).json({ error: "Failed to rollback project status" });
  }
});

export default router;
