/**
 * @file local-dev-public.ts
 * @description Public gateway routes for the Secure Localhost Development Connector.
 * Handles the temporary development URL proxying and outbound connector bridge communications.
 */
import { Router, Request, Response } from "express";
import { db, projectLocalSessions, withBypassRLS } from "@workspace/db";
import { eq, and, isNull, or, desc } from "drizzle-orm";
import { localDevBridge } from "../services/local-dev-bridge";
import { logger } from "../lib/logger";

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Helper to look up active session by connectorToken or sessionId
async function findActiveLocalSession(token: string) {
  const isUuid = UUID_REGEX.test(token);
  return await withBypassRLS(async (tx: any) => {
    const tokenFilter = isUuid
      ? or(eq(projectLocalSessions.connectorToken, token), eq(projectLocalSessions.id, token))
      : eq(projectLocalSessions.connectorToken, token);

    const [session] = await tx
      .select()
      .from(projectLocalSessions)
      .where(
        and(
          tokenFilter,
          or(
            eq(projectLocalSessions.status, "CONNECTED"),
            eq(projectLocalSessions.status, "READY"),
            eq(projectLocalSessions.status, "TESTING")
          ),
          isNull(projectLocalSessions.revokedAt)
        )
      )
      .orderBy(desc(projectLocalSessions.createdAt))
      .limit(1);
    return session;
  });
}

/**
 * GET /api/local-dev/bridge/:token/status
 * Check if the connector is live for this session
 */
router.get("/bridge/:token/status", async (req: Request, res: Response): Promise<any> => {
  const token = String(req.params.token);
  const session = await findActiveLocalSession(token);

  if (!session) {
    return res.status(404).json({
      connected: false,
      status: "EXPIRED_OR_REVOKED",
      error: "Temporary development session not found or expired."
    });
  }

  const isExpired = session.expiresAt ? new Date(session.expiresAt).getTime() <= Date.now() : false;
  if (isExpired) {
    return res.status(410).json({
      connected: false,
      status: "EXPIRED",
      error: "Temporary development session has expired."
    });
  }

  const isBridgeConnected = localDevBridge.isConnected(token);

  return res.json({
    connected: isBridgeConnected,
    sessionId: session.id,
    projectId: session.projectId,
    localUrl: session.localUrl,
    developmentUrl: session.developmentUrl,
    status: session.status,
    expiresAt: session.expiresAt,
    environment: "LOCAL_DEVELOPMENT"
  });
});

/**
 * POST /api/local-dev/bridge/:token/poll
 * Outbound long-polling connection from the user's laptop connector
 */
router.post("/bridge/:token/poll", async (req: Request, res: Response): Promise<any> => {
  const token = String(req.params.token);
  const session = await findActiveLocalSession(token);

  if (!session) {
    return res.status(403).json({ error: "Invalid, expired, or revoked local development token." });
  }

  const isExpired = session.expiresAt ? new Date(session.expiresAt).getTime() <= Date.now() : false;
  if (isExpired) {
    return res.status(410).json({ error: "Local development session has expired." });
  }

  // Register session with bridge
  localDevBridge.registerSession(token, session.projectId, session.organizationId, session.localUrl);

  try {
    const requests = await localDevBridge.pollRequests(token, 25000);
    return res.json({ requests });
  } catch (err: any) {
    return res.json({ requests: [] });
  }
});

/**
 * POST /api/local-dev/bridge/:token/response
 * Submits the response fetched by the local connector back to NOVA backend
 */
router.post("/bridge/:token/response", async (req: Request, res: Response): Promise<any> => {
  const token = String(req.params.token);
  const payload = req.body;

  if (!payload || !payload.requestId) {
    return res.status(400).json({ error: "Missing requestId or response payload." });
  }

  const success = localDevBridge.submitResponse(token, payload);
  return res.json({ success });
});

/**
 * router.use("/tunnel-proxy/:token", ...)
 * Public Temporary Development URL proxy endpoint.
 * Serves website pages from the developer's laptop to NOVA WebsiteDiscoveryService or browser testing.
 */
router.use("/tunnel-proxy/:token", async (req: Request, res: Response): Promise<any> => {
  const token = String(req.params.token);
  const session = await findActiveLocalSession(token);

  if (!session) {
    return res.status(404).send(`<!DOCTYPE html>
<html>
<head><title>NOVA - Temporary Development URL Unavailable</title></head>
<body style="font-family: system-ui; max-width: 600px; margin: 50px auto; line-height: 1.6; padding: 20px;">
  <h2>Development Link Unavailable</h2>
  <p>This temporary development connection is expired, stopped, or does not exist.</p>
  <p><small>Environment: LOCAL DEVELOPMENT</small></p>
</body>
</html>`);
  }

  const isExpired = session.expiresAt ? new Date(session.expiresAt).getTime() <= Date.now() : false;
  if (isExpired) {
    return res.status(410).send(`<!DOCTYPE html>
<html>
<head><title>NOVA - Temporary Development URL Expired</title></head>
<body style="font-family: system-ui; max-width: 600px; margin: 50px auto; line-height: 1.6; padding: 20px;">
  <h2>Development Session Expired</h2>
  <p>Your 30-minute temporary development session has expired. Start a new test session in NOVA dashboard to continue.</p>
  <p><small>Environment: LOCAL DEVELOPMENT</small></p>
</body>
</html>`);
  }

  // In router.use, req.url is relative to the mounted path (e.g. "/", "/pricing", "/about")
  const subPath = req.url && req.url.startsWith("/") ? req.url : `/${req.url || ""}`;

  try {
    const upstream = await localDevBridge.dispatchFetch(token, subPath, {
      "user-agent": "NOVA-Website-Discovery/1.0",
      "accept": req.headers["accept"] || "text/html,application/xhtml+xml,application/xml"
    });

    res.status(upstream.statusCode || 200);
    res.setHeader("Content-Type", upstream.headers?.["content-type"] || "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("X-Environment", "LOCAL_DEVELOPMENT");

    if (upstream.isBase64) {
      return res.send(Buffer.from(upstream.body, "base64"));
    }
    return res.send(upstream.body);
  } catch (err: any) {
    logger.warn({ err: err.message, token, subPath }, "[LOCAL_DEV_PROXY] Failed to fetch from local connector");
    return res.status(502).send(`<!DOCTYPE html>
<html>
<head><title>NOVA - Local Development Connector</title></head>
<body style="font-family: system-ui; max-width: 600px; margin: 50px auto; line-height: 1.6; padding: 20px;">
  <h2>Local Website Unreachable</h2>
  <p>${err.message || "Could not reach local development website."}</p>
  <p>Ensure your local web server is running and the NOVA local connector is active.</p>
  <p><small>Target: ${session.localUrl}</small></p>
</body>
</html>`);
  }
});

export default router;
