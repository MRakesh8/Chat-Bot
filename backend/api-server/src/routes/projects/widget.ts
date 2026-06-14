import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { projectWidgetSettings, projectApiKeys } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const router = Router({ mergeParams: true });

function generateWidgetToken() {
  return crypto.randomBytes(32).toString("hex");
}

router.get("/settings", async (req: Request, res: Response) => {
  const { projectId } = req.params;

  try {
    let settings = await db.query.projectWidgetSettings.findFirst({
      where: eq(projectWidgetSettings.projectId, projectId)
    });

    if (!settings) {
      // Create default settings if not exist
      const defaultSettings = {
        projectId,
        botName: "AI Assistant",
        welcomeMessage: "Hello 👋 How can I help today?",
        themeColor: "#8B5CF6",
        position: "bottom-right",
        displayMode: "floating",
        allowedDomains: [],
        leadsEnabled: false,
        isEnabled: true,
        widgetToken: generateWidgetToken(),
      };
      await db.insert(projectWidgetSettings).values(defaultSettings as any);
      settings = await db.query.projectWidgetSettings.findFirst({
        where: eq(projectWidgetSettings.projectId, projectId)
      });
    }

    res.json(settings);
  } catch (error) {
    console.error("Failed to fetch widget settings:", error);
    res.status(500).json({ error: "Failed to fetch widget settings" });
  }
});

router.put("/settings", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const updates = req.body;

  try {
    const existing = await db.query.projectWidgetSettings.findFirst({
      where: eq(projectWidgetSettings.projectId, projectId)
    });

    if (!existing) {
      const defaultSettings = {
        projectId,
        botName: updates.botName || "AI Assistant",
        welcomeMessage: updates.welcomeMessage || "Hello 👋",
        themeColor: updates.themeColor || "#8B5CF6",
        position: updates.position || "bottom-right",
        displayMode: updates.displayMode || "floating",
        allowedDomains: updates.allowedDomains || [],
        customCss: updates.customCss,
        customContainerId: updates.customContainerId,
        humanHandoffLinks: updates.humanHandoffLinks || {},
        leadsEnabled: updates.leadsEnabled || false,
        isEnabled: updates.isEnabled ?? true,
        widgetToken: generateWidgetToken(),
      };
      await db.insert(projectWidgetSettings).values(defaultSettings as any);
    } else {
      await db.update(projectWidgetSettings)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(projectWidgetSettings.projectId, projectId));
    }

    const newSettings = await db.query.projectWidgetSettings.findFirst({
      where: eq(projectWidgetSettings.projectId, projectId)
    });
    
    res.json(newSettings);
  } catch (error) {
    console.error("Failed to update widget settings:", error);
    res.status(500).json({ error: "Failed to update widget settings" });
  }
});

// API Keys routes for project
router.get("/api-keys", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  try {
    const keys = await db.query.projectApiKeys.findMany({
      where: eq(projectApiKeys.projectId, projectId),
      columns: {
        id: true,
        provider: true,
        maskedKey: true,
        model: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true
      }
    });
    res.json(keys);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch project keys" });
  }
});

router.post("/api-keys", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { provider, apiKey, model } = req.body;

  if (!provider || !apiKey) {
    return res.status(400).json({ error: "Provider and API Key are required" });
  }

  try {
    // Basic masking (e.g., sk-12...abcd)
    const maskedKey = apiKey.substring(0, 5) + "..." + apiKey.substring(apiKey.length - 4);
    
    // In real implementation, encrypt this with KMS or env secret
    const encryptedKey = apiKey; 

    await db.insert(projectApiKeys).values({
      projectId,
      provider,
      encryptedKey,
      maskedKey,
      model,
      isEnabled: true,
    } as any);

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to add project API key:", error);
    res.status(500).json({ error: "Failed to add project key" });
  }
});

router.delete("/api-keys/:keyId", async (req: Request, res: Response) => {
  const { projectId, keyId } = req.params;
  try {
    await db.delete(projectApiKeys).where(and(
      eq(projectApiKeys.id, keyId as any),
      eq(projectApiKeys.projectId, projectId)
    ));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete project key" });
  }
});

export default router;
