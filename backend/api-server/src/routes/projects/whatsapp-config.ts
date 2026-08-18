import { Router } from "express";
import { db, crypto } from "@workspace/db";
import { whatsappConnections, whatsappSettings, projects } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router = Router({ mergeParams: true });

// Require auth logic exists at the parent level, but just in case we verify project ownership:
const verifyProjectOwnership = async (req: any, res: any, next: any) => {
  const userId = req.auth?.userId;
  const projectId = req.params.projectId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId))
  });
  
  if (!project) return res.status(403).json({ error: "Project not found or unauthorized" });
  next();
};

router.use(verifyProjectOwnership);

router.get("/connections", async (req: any, res: any) => {
  const projectId = req.params.projectId;
  const connections = await db.query.whatsappConnections.findMany({
    where: eq(whatsappConnections.projectId, projectId)
  });
  
  // Mask credentials
  const safeConnections = connections.map(c => ({
    id: c.id,
    provider: c.provider,
    providerAccountId: c.providerAccountId,
    phoneNumber: c.phoneNumber,
    displayName: c.displayName,
    status: c.status,
    hasCredentials: !!c.encryptedCredentials,
    webhookUrl: `${process.env.PUBLIC_API_URL || "https://api.yourdomain.com"}/api/integrations/whatsapp/${c.provider}/${c.id}/webhook`,
    lastConnectedAt: c.lastConnectedAt,
    lastError: c.lastError
  }));

  res.json(safeConnections);
});

router.post("/connections", async (req: any, res: any) => {
  const projectId = req.params.projectId;
  const { provider, providerAccountId, phoneNumber, displayName, credentials } = req.body;

  let encrypted = null;
  if (credentials) {
    encrypted = crypto.encrypt(JSON.stringify(credentials));
  }

  const [conn] = await db.insert(whatsappConnections).values({
    projectId,
    provider,
    providerAccountId,
    phoneNumber,
    displayName,
    encryptedCredentials: encrypted
  }).returning();

  res.json({ id: conn.id, status: conn.status });
});

router.delete("/connections/:connectionId", async (req: any, res: any) => {
  const projectId = req.params.projectId;
  const connectionId = req.params.connectionId;
  await db.delete(whatsappConnections).where(
    and(
      eq(whatsappConnections.id, connectionId),
      eq(whatsappConnections.projectId, projectId)
    )
  );
  res.json({ success: true });
});

import { TimelinesAIProvider } from "../../services/whatsapp/providers/timelines";
import { MetaBusinessProvider } from "../../services/whatsapp/providers/meta";

const providersMap = {
  timelinesai: new TimelinesAIProvider(),
  meta: new MetaBusinessProvider()
};

router.post("/connections/:connectionId/test", async (req: any, res: any) => {
  const projectId = req.params.projectId;
  const connectionId = req.params.connectionId;
  
  const conn = await db.query.whatsappConnections.findFirst({
    where: and(
      eq(whatsappConnections.id, connectionId),
      eq(whatsappConnections.projectId, projectId)
    )
  });
  
  if (!conn || !conn.encryptedCredentials) {
    return res.status(404).json({ error: "Connection or credentials not found" });
  }

  const provider = providersMap[conn.provider as keyof typeof providersMap];
  if (!provider || !provider.getConnectionStatus) {
    return res.status(400).json({ error: "Provider does not support connection testing" });
  }

  let credentials = {};
  try {
    credentials = JSON.parse(crypto.decrypt(conn.encryptedCredentials));
  } catch (e) {
    return res.status(500).json({ error: "Failed to decrypt credentials" });
  }

  const result = await provider.getConnectionStatus(credentials);
  
  if (result.connected) {
    await db.update(whatsappConnections)
      .set({ status: "connected", lastConnectedAt: new Date(), lastError: null })
      .where(eq(whatsappConnections.id, connectionId));
    res.json({ status: "connected", info: result.info });
  } else {
    await db.update(whatsappConnections)
      .set({ status: "error", lastError: result.info })
      .where(eq(whatsappConnections.id, connectionId));
    res.status(400).json({ status: "error", error: result.info });
  }
});

router.get("/settings", async (req: any, res: any) => {
  const projectId = req.params.projectId;
  let settings = await db.query.whatsappSettings.findFirst({
    where: eq(whatsappSettings.projectId, projectId)
  });

  if (!settings) {
    // Return defaults
    settings = {
      projectId,
      autoReplyEnabled: false,
      replyMode: "all_business_questions",
      confidenceThreshold: 70,
      humanHandoffEnabled: true,
      allowedTopics: [],
      blockedTopics: [],
      businessHours: {},
      maxAiReplies: 50
    } as any;
  }
  res.json(settings);
});

router.put("/settings", async (req: any, res: any) => {
  const projectId = req.params.projectId;
  const body = req.body;

  const existing = await db.query.whatsappSettings.findFirst({
    where: eq(whatsappSettings.projectId, projectId)
  });

  if (existing) {
    await db.update(whatsappSettings).set(body).where(eq(whatsappSettings.projectId, projectId));
  } else {
    await db.insert(whatsappSettings).values({
      projectId,
      ...body
    });
  }

  res.json({ success: true });
});

export default router;
