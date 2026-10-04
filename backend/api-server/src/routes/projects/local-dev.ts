/**
 * @file local-dev.ts
 * @description Authenticated routes for managing Local Development & Pre-Production Testing sessions,
 * secure temporary development URLs, and local website discovery crawling.
 */
import { Router, Response } from "express";
import { eq, and, desc, isNull, or } from "drizzle-orm";
import { randomBytes } from "crypto";
import { 
  db, 
  withTenantContext, 
  withBypassRLS, 
  projects, 
  projectWidgetSettings, 
  projectLocalSessions,
  auditLogs 
} from "@workspace/db";
import { validateSafeLocalUrl, isLocalhostOrigin } from "../../security";
import { localDevBridge } from "../../services/local-dev-bridge";
import { WebsiteDiscoveryService } from "../../services/discovery";
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

// Helper to resolve and authorize user against project and organization
async function authorizeProjectAccess(req: any, projectId: string) {
  const userId = req.auth?.userId ?? null;
  if (!userId) {
    return { authorized: false, status: 401, error: "Unauthorized" };
  }

  // Fetch project metadata using bypass to check tenant mapping
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
    isWorkspaceAdmin 
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
 * GET /api/projects/:projectId/local-dev
 * Returns the current active local development session, connector status, and widget token.
 */
router.get("/", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const auth = await authorizeProjectAccess(req, projectId);
  if (!auth.authorized) {
    return res.status(auth.status!).json({ error: auth.error });
  }

  try {
    const session = await withTenantContext(auth.orgId, async (tx: any) => {
      const [latest] = await tx
        .select()
        .from(projectLocalSessions)
        .where(eq(projectLocalSessions.projectId, projectId))
        .orderBy(desc(projectLocalSessions.createdAt))
        .limit(1);
      return latest;
    });

    const [widgetSettings] = await withBypassRLS(async (tx: any) => {
      return await tx.select().from(projectWidgetSettings).where(eq(projectWidgetSettings.projectId, projectId)).limit(1);
    });

    const isExpired = session?.expiresAt ? new Date(session.expiresAt).getTime() <= Date.now() : false;
    const isRevoked = !!session?.revokedAt;
    
    let effectiveStatus = session?.status || "NOT_STARTED";
    if (session && (isExpired || isRevoked || session.status === "STOPPED")) {
      effectiveStatus = isRevoked ? "REVOKED" : (isExpired ? "EXPIRED" : "STOPPED");
    }

    const isBridgeConnected = session?.connectorToken ? localDevBridge.isConnected(session.connectorToken) : false;
    const serverBaseUrl = resolveServerBaseUrl(req);
    const parsedPort = session?.localUrl ? (new URL(session.localUrl).port || "3000") : "3000";

    return res.json({
      session: session ? {
        id: session.id,
        projectId: session.projectId,
        localUrl: session.localUrl,
        developmentUrl: session.developmentUrl,
        status: effectiveStatus,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        connectorToken: session.connectorToken,
        connectorCommand: session.connectorToken 
          ? `node scripts/local-connector.mjs --token ${session.connectorToken} --port ${parsedPort} --server ${serverBaseUrl}`
          : null,
        isBridgeConnected
      } : null,
      widgetToken: widgetSettings?.widgetToken || null,
      environment: "LOCAL_DEVELOPMENT",
      productionWebsiteUrl: auth.project.websiteUrl || null,
      tunnelStatus: session?.developmentUrl && !isExpired && !isRevoked ? "ACTIVE" : "NOT_STARTED"
    });
  } catch (error: any) {
    req.log.error({ err: error, projectId }, "Error fetching local development session");
    return res.status(500).json({ error: "Failed to fetch local development session" });
  }
});

/**
 * POST /api/projects/:projectId/local-dev/connect
 * Connects and registers a local website URL for pre-production testing.
 * Strict SSRF protection and tenant authorization applied.
 * Does NOT overwrite or alter production website configuration.
 */
router.post("/connect", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const { localUrl } = req.body;

  const auth = await authorizeProjectAccess(req, projectId);
  if (!auth.authorized) {
    return res.status(auth.status!).json({ error: auth.error });
  }

  // 1. Strict validation of local development URL
  const validation = validateSafeLocalUrl(localUrl);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const safeLocalUrl = validation.normalizedUrl!;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours default for local browser testing

  try {
    const [savedSession] = await withTenantContext(auth.orgId, async (tx: any) => {
      // Invalidate previous active sessions
      await tx
        .update(projectLocalSessions)
        .set({ status: "STOPPED", revokedAt: new Date() })
        .where(and(
          eq(projectLocalSessions.projectId, projectId),
          eq(projectLocalSessions.status, "CONNECTED")
        ));

      // Create new active session
      return await tx
        .insert(projectLocalSessions)
        .values({
          projectId,
          organizationId: auth.orgId,
          userId: auth.userId,
          localUrl: safeLocalUrl,
          status: "CONNECTED",
          expiresAt,
          updatedAt: new Date()
        })
        .returning();
    });

    // Fetch widget settings for embedding snippet
    let [widgetSettings] = await withBypassRLS(async (tx: any) => {
      return await tx.select().from(projectWidgetSettings).where(eq(projectWidgetSettings.projectId, projectId)).limit(1);
    });

    // Log security audit
    await withBypassRLS(async (tx: any) => {
      await tx.insert(auditLogs).values({
        userId: auth.userId,
        action: "LOCAL_DEV_SESSION_CONNECTED",
        target: `project:${projectId}:local:${safeLocalUrl}`,
      });
    }).catch(() => {});

    return res.status(200).json({
      message: "Local website connected for pre-production testing.",
      session: {
        id: savedSession.id,
        projectId: savedSession.projectId,
        localUrl: savedSession.localUrl,
        status: savedSession.status,
        createdAt: savedSession.createdAt,
        expiresAt: savedSession.expiresAt,
      },
      environment: "LOCAL_DEVELOPMENT",
      widgetToken: widgetSettings?.widgetToken || null,
      instructions: [
        "1. Ensure your local development server is running at " + safeLocalUrl,
        "2. Copy and paste the chatbot integration snippet into your local website HTML before </body>",
        "3. Open " + safeLocalUrl + " in your browser and test chat interactions."
      ]
    });
  } catch (error: any) {
    req.log.error({ err: error, projectId }, "Error connecting local development website");
    return res.status(500).json({ error: "Failed to connect local development website" });
  }
});

/**
 * POST /api/projects/:projectId/local-dev/tunnel
 * Creates or configures a Secure Temporary Development URL.
 * Automatically generates a 30-minute expiring outbound bridge tunnel token and proxy URL,
 * or accepts a verified manual secure tunnel (e.g. Cloudflare Tunnel / ngrok).
 */
router.post("/tunnel", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const { developmentUrl: manualUrl } = req.body || {};

  const auth = await authorizeProjectAccess(req, projectId);
  if (!auth.authorized) {
    return res.status(auth.status!).json({ error: auth.error });
  }

  try {
    // 1. Fetch active session
    let session = await withTenantContext(auth.orgId, async (tx: any) => {
      const [latest] = await tx
        .select()
        .from(projectLocalSessions)
        .where(
          and(
            eq(projectLocalSessions.projectId, projectId),
            eq(projectLocalSessions.status, "CONNECTED"),
            isNull(projectLocalSessions.revokedAt)
          )
        )
        .orderBy(desc(projectLocalSessions.createdAt))
        .limit(1);
      return latest;
    });

    // If no active session, create default on localhost:3000
    if (!session) {
      const defaultUrl = "http://localhost:3000";
      [session] = await withTenantContext(auth.orgId, async (tx: any) => {
        return await tx
          .insert(projectLocalSessions)
          .values({
            projectId,
            organizationId: auth.orgId,
            userId: auth.userId,
            localUrl: defaultUrl,
            status: "CONNECTED",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000)
          })
          .returning();
      });
    }

    const serverBaseUrl = resolveServerBaseUrl(req);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes duration

    let developmentUrl = "";
    let connectorToken = session.connectorToken || ("ldev_conn_" + randomBytes(20).toString("hex"));

    if (manualUrl && typeof manualUrl === "string") {
      // Validate manual tunnel URL safely with SSRF protection
      const validated = await WebsiteDiscoveryService.validateUrlSafe(manualUrl.trim());
      developmentUrl = validated.toString();
    } else {
      // Automatic temporary development URL via NOVA outbound bridge
      developmentUrl = `${serverBaseUrl}/api/local-dev/tunnel-proxy/${connectorToken}`;
    }

    // Update session with developmentUrl and connectorToken
    const [updatedSession] = await withTenantContext(auth.orgId, async (tx: any) => {
      return await tx
        .update(projectLocalSessions)
        .set({
          developmentUrl,
          connectorToken,
          status: "CONNECTED",
          expiresAt,
          updatedAt: new Date()
        })
        .where(eq(projectLocalSessions.id, session.id))
        .returning();
    });

    // Register active bridge session
    localDevBridge.registerSession(connectorToken, projectId, auth.orgId, session.localUrl);

    // Audit log
    await withBypassRLS(async (tx: any) => {
      await tx.insert(auditLogs).values({
        userId: auth.userId,
        action: "LOCAL_DEV_TUNNEL_CREATED",
        target: `project:${projectId}:tunnel:${developmentUrl}`,
      });
    }).catch(() => {});

    const parsedPort = new URL(session.localUrl).port || "3000";
    const connectorCommand = `node scripts/local-connector.mjs --token ${connectorToken} --port ${parsedPort} --server ${serverBaseUrl}`;

    return res.json({
      status: "ACTIVE",
      developmentUrl,
      connectorToken,
      expiresAt: updatedSession.expiresAt,
      sessionId: updatedSession.id,
      connectorCommand,
      environment: "LOCAL_DEVELOPMENT",
      instructions: [
        `1. Run the local connector on your machine: ${connectorCommand}`,
        `2. NOVA can now securely discover and crawl your local website at ${developmentUrl}`,
        "3. Temporary development access automatically expires in 30 minutes or when stopped."
      ]
    });
  } catch (error: any) {
    req.log.error({ err: error, projectId }, "Error creating temporary development connection");
    return res.status(500).json({ error: error.message || "Failed to create temporary development connection" });
  }
});

/**
 * POST /api/projects/:projectId/local-dev/stop
 * Stops and revokes active local development testing sessions.
 * Leaves production configuration and live widgets completely untouched.
 */
router.post("/stop", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const auth = await authorizeProjectAccess(req, projectId);
  if (!auth.authorized) {
    return res.status(auth.status!).json({ error: auth.error });
  }

  try {
    const revokedSessions = await withTenantContext(auth.orgId, async (tx: any) => {
      return await tx
        .update(projectLocalSessions)
        .set({
          status: "STOPPED",
          revokedAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(
          eq(projectLocalSessions.projectId, projectId),
          isNull(projectLocalSessions.revokedAt)
        ))
        .returning();
    });

    // Invalidate in-memory bridge sessions
    for (const sess of revokedSessions) {
      if (sess.connectorToken) {
        localDevBridge.revokeSession(sess.connectorToken);
      }
    }

    // Audit log
    await withBypassRLS(async (tx: any) => {
      await tx.insert(auditLogs).values({
        userId: auth.userId,
        action: "LOCAL_DEV_SESSION_STOPPED",
        target: `project:${projectId}`,
      });
    }).catch(() => {});

    return res.json({
      success: true,
      message: "Local testing session and temporary development connection stopped successfully. Production configuration remains untouched.",
      status: "STOPPED"
    });
  } catch (error: any) {
    req.log.error({ err: error, projectId }, "Error stopping local testing session");
    return res.status(500).json({ error: "Failed to stop local testing session" });
  }
});

/**
 * POST /api/projects/:projectId/local-dev/discover
 * Runs WebsiteDiscoveryService through the active temporary development URL.
 * Ingests website content, FAQs, offerings, and contact details without modifying production websiteUrl.
 */
router.post("/discover", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const auth = await authorizeProjectAccess(req, projectId);
  if (!auth.authorized) {
    return res.status(auth.status!).json({ error: auth.error });
  }

  try {
    const session = await withTenantContext(auth.orgId, async (tx: any) => {
      const [latest] = await tx
        .select()
        .from(projectLocalSessions)
        .where(
          and(
            eq(projectLocalSessions.projectId, projectId),
            eq(projectLocalSessions.status, "CONNECTED"),
            isNull(projectLocalSessions.revokedAt)
          )
        )
        .orderBy(desc(projectLocalSessions.createdAt))
        .limit(1);
      return latest;
    });

    if (!session || !session.developmentUrl) {
      return res.status(400).json({ 
        error: "No active temporary development connection found. Please start a temporary connection first." 
      });
    }

    const isExpired = session.expiresAt ? new Date(session.expiresAt).getTime() <= Date.now() : false;
    if (isExpired) {
      return res.status(410).json({ 
        error: "Temporary development connection has expired. Please start a new session." 
      });
    }

    // Run WebsiteDiscoveryService in local dev mode
    await WebsiteDiscoveryService.runDiscovery(projectId, session.developmentUrl, auth.orgId, {
      isLocalDev: true,
      sessionId: session.id
    });

    // Audit log
    await withBypassRLS(async (tx: any) => {
      await tx.insert(auditLogs).values({
        userId: auth.userId,
        action: "LOCAL_DEV_DISCOVERY_COMPLETED",
        target: `project:${projectId}:url:${session.developmentUrl}`,
      });
    }).catch(() => {});

    return res.json({
      success: true,
      message: "Local website discovery completed successfully. Knowledge sources ingested for chatbot testing.",
      environment: "LOCAL_DEVELOPMENT"
    });
  } catch (error: any) {
    req.log.error({ err: error, projectId }, "Error running local website discovery");
    return res.status(500).json({ error: error.message || "Failed to discover local website" });
  }
});

export default router;
