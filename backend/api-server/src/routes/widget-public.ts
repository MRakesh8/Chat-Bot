import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { projectWidgetSettings, projects, knowledgeSources, knowledgeChunks, projectApiKeys, userApiKeys } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { UniversalProviderAdapter } from "../services/llm-provider";

const router = Router();

// Middleware to validate origin for widget routes
router.use(async (req: Request, res: Response, next) => {
  // Extract token from URL path if possible, since req.params isn't populated yet in top-level use()
  const pathToken = req.path.split('/')[1]; 
  const widgetToken = req.params?.widgetToken || req.body?.widgetToken || req.query?.widgetToken || pathToken;
  
  if (!widgetToken) {
    return res.status(401).json({ error: "Missing widget token" });
  }

  try {
    const settings = await db.query.projectWidgetSettings.findFirst({
      where: eq(projectWidgetSettings.widgetToken, widgetToken as string)
    });

    if (!settings || !settings.isEnabled) {
      return res.status(403).json({ error: "Invalid or disabled widget token" });
    }

    const origin = req.headers.origin;
    if (origin && settings.allowedDomains.length > 0) {
      const allowedUrls = settings.allowedDomains.map((domain: string) => {
        try {
          return new URL(domain.startsWith("http") ? domain : `https://${domain}`).hostname;
        } catch {
          return domain;
        }
      });
      
      const requestHostname = new URL(origin).hostname;
      if (!allowedUrls.includes(requestHostname)) {
        return res.status(403).json({ error: "Domain not authorized" });
      }
    }

    // Pass projectId to request
    (req as any).projectId = settings.projectId;
    next();
  } catch (error) {
    console.error("Widget validation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:widgetToken/config", async (req: Request, res: Response) => {
  try {
    const projectId = (req as any).projectId;
    const settings = await db.query.projectWidgetSettings.findFirst({
      where: eq(projectWidgetSettings.projectId, projectId)
    });

    if (!settings) {
      return res.status(404).json({ error: "Widget config not found" });
    }

    // Return safe configuration (no keys, no internal ids if possible)
    res.json({
      botName: settings.botName,
      botAvatar: settings.botAvatar,
      welcomeMessage: settings.welcomeMessage,
      themeColor: settings.themeColor,
      position: settings.position,
      displayMode: settings.displayMode,
      customCss: settings.customCss,
      customContainerId: settings.customContainerId,
      humanHandoffLinks: settings.humanHandoffLinks,
      leadsEnabled: settings.leadsEnabled
    });
  } catch (error) {
    console.error("Failed to fetch widget config", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:widgetToken/chat", async (req: Request, res: Response) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid messages format" });
  }

  try {
    const projectId = (req as any).projectId;
    
    // Resolve Key (Project -> User -> System)
    const projectKey = await db.query.projectApiKeys.findFirst({
      where: and(eq(projectApiKeys.projectId, projectId), eq(projectApiKeys.isEnabled, true))
    });

    let activeKey = null;
    let providerName = "gemini";
    let modelName = "gemini-1.5-flash"; // default fallback

    if (projectKey) {
      activeKey = projectKey.encryptedKey; // Decryption would happen here in a real impl
      providerName = projectKey.provider;
      modelName = projectKey.model || modelName;
    } else {
      // Fallback logic to User or System keys
      const systemKeys = await db.query.userApiKeys.findMany({
        where: and(eq(userApiKeys.isSystem, true), eq(userApiKeys.isEnabled, true))
      });
      if (systemKeys.length > 0) {
        activeKey = systemKeys[0].encryptedKey;
        providerName = systemKeys[0].provider;
      } else if (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY) {
        activeKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        providerName = "gemini";
        modelName = "gemini-1.5-flash";
      } else {
        return res.status(503).json({ error: "No API keys configured" });
      }
    }

    const adapter = new UniversalProviderAdapter({
      provider: providerName,
      apiKey: activeKey, // Should decrypt here!
      model: modelName
    });

    // TODO: Retrieval logic filtering by isWidgetExposed
    // This is a placeholder for actual vector search
    // const context = await retrieveKnowledge(projectId, lastUserMessage, true);

    const systemPrompt = `You are a helpful assistant.`;

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    const response = await adapter.generateChat({
      messages: fullMessages as any,
      temperature: 0.7
    });

    res.json({
      content: response.content,
      usage: response.usage
    });
  } catch (error) {
    console.error("Widget chat error:", error);
    res.status(500).json({ error: "Failed to process chat" });
  }
});

export default router;
