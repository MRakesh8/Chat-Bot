import { Router, Request, Response } from "express";
import { db, crypto } from "@workspace/db";
import { projectWidgetSettings, projects, knowledgeSources, knowledgeChunks, projectApiKeys, userApiKeys } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { UniversalProviderAdapter } from "../services/llm-provider";
import { GoogleGenAI } from "@google/genai";
import { ai } from "@workspace/integrations-gemini-ai";
import { searchProjectKnowledge, saveAutoKnowledgeItem } from "../services/knowledge";

const router = Router();

// Middleware to validate origin for widget routes
router.use(async (req: Request, res: Response, next): Promise<any> => {
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
    if (origin && origin !== "null" && settings.allowedDomains.length > 0) {
      const allowedUrls = settings.allowedDomains.map((domain: string) => {
        try {
          return new URL(domain.startsWith("http") ? domain : `https://${domain}`).hostname;
        } catch {
          return domain;
        }
      });
      
      try {
        const requestHostname = new URL(origin).hostname;
        if (!allowedUrls.includes(requestHostname)) {
          return res.status(403).json({ error: "Domain not authorized" });
        }
      } catch (e) {
        return res.status(403).json({ error: "Invalid origin" });
      }
    }

    // Pass projectId to request
    (req as any).projectId = settings.projectId;
    return next();
  } catch (error) {
    console.error("Widget validation error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:widgetToken/config", async (req: Request, res: Response): Promise<any> => {
  try {
    const projectId = (req as any).projectId;
    const settings = await db.query.projectWidgetSettings.findFirst({
      where: eq(projectWidgetSettings.projectId, projectId)
    });

    if (!settings) {
      return res.status(404).json({ error: "Widget config not found" });
    }

    // Return safe configuration (no keys, no internal ids if possible)
    return res.json({
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
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:widgetToken/chat", async (req: Request, res: Response): Promise<any> => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid messages format" });
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const projectId = (req as any).projectId;

    // Get project details to know the owner's userId for key failover/rotation
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });
    const userId = project ? project.userId : null;

    // Resolve Key (Project -> User -> System -> Env)
    const projectKey = await db.query.projectApiKeys.findFirst({
      where: and(eq(projectApiKeys.projectId, projectId), eq(projectApiKeys.isEnabled, true))
    });

    let activeKey = null;
    let providerName = "gemini";
    let modelName = "gemini-2.5-flash"; // default fallback

    if (projectKey) {
      activeKey = crypto.decrypt(projectKey.encryptedKey); // Decrypted here
      providerName = projectKey.provider;
      modelName = projectKey.model || modelName;
    } else {
      // Fallback logic to User (project owner) or System keys
      let userKey = null;
      if (userId) {
        userKey = await db.query.userApiKeys.findFirst({
          where: and(eq(userApiKeys.userId, userId), eq(userApiKeys.isEnabled, true))
        });
      }
      
      if (userKey) {
        activeKey = crypto.decrypt(userKey.encryptedKey);
        providerName = userKey.provider;
      } else {
        const systemKeys = await db.query.userApiKeys.findMany({
          where: and(eq(userApiKeys.isSystem, true), eq(userApiKeys.isEnabled, true))
        });
        if (systemKeys.length > 0) {
          activeKey = crypto.decrypt(systemKeys[0].encryptedKey);
          providerName = systemKeys[0].provider;
        } else if (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY) {
          activeKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
          providerName = "gemini";
          modelName = "gemini-2.5-flash";
        }
      }
    }

    if (!activeKey) {
      res.write(`data: ${JSON.stringify({ content: "Sorry, no AI API keys are configured for this chatbot. Please configure an API key in your dashboard." })}\n\n`);
      res.end();
      return res;
    }

    const lastUserMessage = messages[messages.length - 1]?.content || "";
    const previousAssistantMessage = messages.length >= 2 ? messages[messages.length - 2]?.content : "";

    // 1. Check if the user is pointing out a mistake
    let userIsPointingOutMistake = false;
    const isCorrectionTriggerWord = lastUserMessage.match(/\b(wrong|mistake|incorrect|false|error|fix|correct|not right|bullshit|fake)\b/i);
    
    if (isCorrectionTriggerWord && messages.length >= 3) {
      try {
        const confirmPrompt = `Analyze the user's message and determine if they are indicating that the assistant made a mistake, gave a wrong or incorrect answer in the previous turn, or is correcting/updating the assistant's facts.
        
        User Message: "${lastUserMessage}"
        
        Respond with only "YES" or "NO".`;
        
        let confirmRes;
        if (providerName === "gemini") {
          const directClient = new GoogleGenAI({
            apiKey: activeKey,
            httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL }
          });
          confirmRes = await directClient.models.generateContent({
            model: modelName,
            contents: confirmPrompt
          });
        } else {
          confirmRes = await ai.models.generateContent(userId, {
            model: "gemini-2.5-flash",
            contents: confirmPrompt
          });
        }
        
        if (confirmRes.text?.trim().toUpperCase() === "YES") {
          userIsPointingOutMistake = true;
        }
      } catch (err) {
        console.error("Error confirming correction:", err);
      }
    }

    // 2. Correction flow using Google Search
    if (userIsPointingOutMistake) {
      res.write(`data: ${JSON.stringify({ content: "🔍 *Checking Google Search to verify and correct my answer...*\n\n" })}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();

      const verifyPrompt = `The user claims the assistant's previous answer was wrong or incomplete.
      Previous Assistant Answer: "${previousAssistantMessage}"
      User Message: "${lastUserMessage}"
      
      Perform a Google search to verify the facts and find the correct, up-to-date answer. Summarize the verified facts clearly.`;

      let verifiedText = "";
      try {
        let searchRes;
        if (providerName === "gemini") {
          const directClient = new GoogleGenAI({
            apiKey: activeKey,
            httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL }
          });
          searchRes = await directClient.models.generateContent({
            model: modelName,
            contents: verifyPrompt,
            config: {
              tools: [{ googleSearch: {} }]
            }
          } as any);
        } else {
          searchRes = await ai.models.generateContent(userId, {
            model: "gemini-2.5-flash",
            contents: verifyPrompt,
            tools: [{ googleSearch: {} }]
          });
        }

        verifiedText = searchRes.text || "";

        // Save new verified fact to project knowledge base
        const correctionContent = `Corrected Fact (based on user feedback and Google search verification):
        Topic/Context: User stated "${lastUserMessage}" in response to previous answer "${previousAssistantMessage}".
        Verified Correct Information: ${verifiedText}
        Updated on: ${new Date().toISOString()}`;

        await saveAutoKnowledgeItem({
          projectId,
          userId,
          content: correctionContent
        });

        // Stream explanation & answer
        const systemPrompt = `You are a helpful customer support chatbot. The user just corrected your previous answer, and you verified the correct info using Google Search.
        
        Verified Information from Google:
        ${verifiedText}
        
        Explain the correction politely, state that you've updated your knowledge base so you won't make this mistake again, and answer their question based on the verified information.`;

        if (providerName === "gemini") {
          const directClient = new GoogleGenAI({
            apiKey: activeKey,
            httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL }
          });
          const stream = await directClient.models.generateContentStream({
            model: modelName,
            contents: [{ role: "user", parts: [{ text: systemPrompt }] }]
          } as any);
          for await (const chunk of stream) {
            if (chunk.text) {
              res.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
              if (typeof (res as any).flush === 'function') (res as any).flush();
            }
          }
        } else {
          const stream = await ai.models.generateContentStream(userId, {
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: systemPrompt }] }]
          });
          for await (const chunk of stream) {
            if (chunk.text) {
              res.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
              if (typeof (res as any).flush === 'function') (res as any).flush();
            }
          }
        }
      } catch (err) {
        console.error("Error in correction flow:", err);
        res.write(`data: ${JSON.stringify({ content: "Sorry, I encountered an error while verifying the information on Google." })}\n\n`);
      }
      res.end();
      return res;
    }

    // 3. Normal flow with Knowledge Base retrieval
    let contextString = "";
    try {
      const searchResult = await searchProjectKnowledge({
        projectIds: [projectId],
        userId,
        query: lastUserMessage,
        limit: 3
      });
      contextString = searchResult.contextString;
    } catch (err) {
      console.error("Error retrieving knowledge for widget chat:", err);
    }

    // Non-Gemini Fallback: returns whole content in single chunk
    if (providerName !== "gemini") {
      const adapter = new UniversalProviderAdapter({
        provider: providerName,
        apiKey: activeKey as string,
        model: modelName
      });
      
      const systemPrompt = `You are a helpful customer support chatbot. Use the following context from our knowledge base to answer the user's questions.
      
      Knowledge Base Context:
      ${contextString}
      
      Answer user questions accurately and concisely.`;

      const fullMessages = [
        { role: "system" as const, content: systemPrompt },
        ...messages
      ];

      const response = await adapter.generateChat({
        messages: fullMessages as any,
        temperature: 0.7
      });

      res.write(`data: ${JSON.stringify({ content: response.content })}\n\n`);
      res.end();
      return res;
    }

    const systemPrompt = `You are a helpful customer support chatbot. Use the following context from our knowledge base to answer the user's questions. If the user tells you that you made a mistake or gave a wrong answer, check your sources, search the web if needed, and correct your answer.

Knowledge Base Context:
${contextString}

Answer user questions accurately and concisely.`;

    const chatMessages = [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Understood. I will act as a helpful customer support chatbot using the provided knowledge base context." }] },
      ...messages.map(m => ({
        role: (m.role === "assistant" ? "model" : "user"),
        parts: [{ text: m.content }]
      }))
    ];

    try {
      const directClient = new GoogleGenAI({
        apiKey: activeKey,
        httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL }
      });
      const stream = await directClient.models.generateContentStream({
        model: modelName,
        contents: chatMessages as any
      } as any);
      for await (const chunk of stream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
          if (typeof (res as any).flush === 'function') (res as any).flush();
        }
      }
    } catch (err) {
      console.error("Error generating normal stream response:", err);
      res.write(`data: ${JSON.stringify({ content: "Sorry, I am having trouble connecting right now." })}\n\n`);
    }
    res.end();
    return res;

  } catch (error: any) {
    console.error("Widget chat general error:", error);
    res.write(`data: ${JSON.stringify({ content: "Internal server error occurred." })}\n\n`);
    res.end();
    return res;
  }
});

export default router;
