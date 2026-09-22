import { BaseAgent, AgentContext, AgentResult } from "./base";
import { ai } from "@workspace/integrations-gemini-ai";
import { db } from "@workspace/db";
import { projectApiKeys } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { crypto } from "@workspace/db";
import { GoogleGenAI } from "@google/genai";
import nodeCrypto from "crypto";
import { llmResponseCache } from "../services/cache-provider";

export class PlannerAgent extends BaseAgent {
  constructor() {
    super("PlannerAgent");
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const { projectId, payload } = context;
      
      const intent = payload?.intent || "Unknown intent";
      const currentUrl = payload?.currentUrl || "";
      const websiteContext = payload?.context || "No context provided.";

      // Fetch primary api key
      const [keyData] = await db
        .select()
        .from(projectApiKeys)
        .where(eq(projectApiKeys.projectId, projectId));
        
      if (!keyData) {
         return { success: false, error: "No API key found for this project." };
      }
      
      const activeKey = crypto.decrypt(keyData.encryptedKey) || keyData.encryptedKey;
      const httpOptions: any = {};
      if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
         httpOptions.baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '');
      }
      const directClient = new GoogleGenAI({
        apiKey: activeKey,
        ...(Object.keys(httpOptions).length > 0 ? { httpOptions } : {})
      });

      const systemPrompt = `You are NOVA AI's Planner Agent, an autonomous Website Agent.
Your job is to translate the user's intent into executable JSON browser actions.

AVAILABLE ACTIONS:
- {"type": "navigate", "target": "URL"}
- {"type": "click", "target": "Element Description"}
- {"type": "type", "target": "Element Description", "value": "text to type"}
- {"type": "scroll", "target": "down"}
- {"type": "wait", "duration": 1000}

RULES:
1. ONLY output a JSON array of action objects. No markdown formatting, no conversational text.
2. Ensure the actions logically fulfill the user's request based on the current context.

CONTEXT:
Current URL: ${currentUrl}
Website Context: ${JSON.stringify(websiteContext)}
`;

      const plannerHash = nodeCrypto.createHash("sha256").update(systemPrompt + intent).digest("hex");
      const cachedPlannerResult = await llmResponseCache.get(`planner_${plannerHash}`);
      
      let planSteps = [];
      let usedCache = false;

      if (cachedPlannerResult) {
         try {
             planSteps = JSON.parse(cachedPlannerResult);
             if (!Array.isArray(planSteps)) {
                 planSteps = [planSteps];
             }
             usedCache = true;
         } catch (e) {
             // Fall through
         }
      }

      if (!usedCache) {
          const FALLBACK_MODELS = [
        keyData.model || "gemini-2.0-flash", 
        "gemini-2.0-flash-lite", 
        "gemini-1.5-pro",
        "gemini-1.5-flash-002", 
        "gemini-1.5-flash-8b"
      ];
      
      let response = null;
      let lastError = null;
      
      for (const attemptModel of FALLBACK_MODELS) {
         try {
             response = await directClient.models.generateContent({
               model: attemptModel === "gemini-2.5-flash" ? "gemini-2.0-flash" : attemptModel,
               contents: [
                  { role: "user", parts: [{ text: systemPrompt }] },
                  { role: "user", parts: [{ text: `User Intent: ${intent}\n\nGenerate the action plan as a JSON array.` }] }
               ],
               config: {
                  responseMimeType: "application/json",
               }
             });
             break; // Success
         } catch (e: any) {
             lastError = e;
             const status = e?.status || e?.response?.status || e?.code;
             const statusStr = String(status || "").toUpperCase();
             const errMessage = String(e?.message || e?.stack || e).toLowerCase();
             const isQuotaExhausted = status === 429 || statusStr === "RESOURCE_EXHAUSTED" || errMessage.includes("quota") || errMessage.includes("429");
             
             if (isQuotaExhausted) {
                 console.error(`[PlannerAgent] Model ${attemptModel} failed with Quota Exhausted. Aborting fallback loop.`);
                 break;
             }
             
             console.warn(`[PlannerAgent] Model ${attemptModel} failed:`, e.message);
         }
      }
      
      if (!response) {
         throw lastError || new Error("All fallback models failed for PlannerAgent");
      }

      try {
         const textResult = response.text || "[]";
         planSteps = JSON.parse(textResult);
         if (!Array.isArray(planSteps)) {
            planSteps = [planSteps];
         }
         await llmResponseCache.set(`planner_${plannerHash}`, JSON.stringify(planSteps), 300); // 5 minutes
      } catch (e) {
         console.error("Failed to parse Planner JSON:", e);
      }
      } // end !usedCache block

      const plan = {
        goal: intent,
        steps: planSteps.map((step: any, index: number) => ({
           stepId: index + 1,
           actionType: step.type,
           actionTarget: step.target,
           actionValue: step.value,
           status: "pending"
        })),
        currentStepIndex: 0
      };

      return {
        success: true,
        data: { plan },
        confidenceScore: 0.95
      };
    } catch (error: any) {
      console.error("PlannerAgent error:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
