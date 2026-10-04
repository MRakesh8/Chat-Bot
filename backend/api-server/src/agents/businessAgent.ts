import { BaseAgent, AgentContext, AgentResult } from "./base";
import { SecurityAgent } from "./security";
import { VerificationAgent } from "./verification";
import { providerRegistry } from "../services/integrations/provider-registry";
import { executeServerTool } from "../services/tool-execution";
import { checkProjectEntitlement } from "../security/entitlement";
import { searchProjectKnowledge } from "../services/knowledge";
import { db } from "@workspace/db";
import {
  projects,
  integrationTools,
  projectIntegrations,
  enterpriseAuditLogs
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";
import { logger } from "../lib/logger";

export interface CapabilityStatus {
  capabilityId: string;
  name: string;
  providerId: string;
  status: "DISCOVERED" | "VERIFIED" | "AUTHORIZED" | "EXECUTABLE" | "UNAVAILABLE";
  riskLevel: "READ_ONLY" | "LOW_RISK_WRITE" | "HIGH_RISK_WRITE" | "IRREVERSIBLE";
}

export class BusinessAgent extends BaseAgent {
  private securityAgent: SecurityAgent;
  private verificationAgent: VerificationAgent;

  constructor() {
    super("BusinessAgent");
    this.securityAgent = new SecurityAgent();
    this.verificationAgent = new VerificationAgent();
  }

  /**
   * Discovers and evaluates all capabilities for a given project from database state.
   */
  async getProjectCapabilities(projectId: string): Promise<CapabilityStatus[]> {
    const capabilities: CapabilityStatus[] = [];

    try {
      // 1. Query database for tools registered to this project
      const toolsInDb = await db
        .select({
          toolId: integrationTools.id,
          actionName: integrationTools.actionName,
          description: integrationTools.description,
          riskLevel: integrationTools.riskLevel,
          toolIsEnabled: integrationTools.isEnabled,
          toolStatus: integrationTools.status,
          integrationId: integrationTools.integrationId,
          provider: projectIntegrations.provider,
          integrationStatus: projectIntegrations.status,
        })
        .from(integrationTools)
        .innerJoin(projectIntegrations, eq(integrationTools.integrationId, projectIntegrations.id))
        .where(eq(integrationTools.projectId, projectId));

      for (const t of toolsInDb) {
        const isExecutable =
          t.toolIsEnabled &&
          t.toolStatus === "EXECUTABLE" &&
          t.integrationStatus === "AUTHORIZED";

        capabilities.push({
          capabilityId: t.actionName,
          name: t.actionName,
          providerId: t.provider,
          status: isExecutable ? "EXECUTABLE" : (t.toolStatus as any || "DISCOVERED"),
          riskLevel: t.riskLevel as any,
        });
      }

      // 2. Discover static provider tools registered in providerRegistry that are not yet connected
      const providers = providerRegistry.getAllProviders();
      for (const pId of providers) {
        const provider = providerRegistry.getProvider(pId);
        const tools = provider.getAvailableTools();

        for (const t of tools) {
          const exists = capabilities.some((c) => c.capabilityId === t.actionName);
          if (!exists) {
            capabilities.push({
              capabilityId: t.actionName,
              name: t.actionName,
              providerId: pId,
              status: "DISCOVERED",
              riskLevel: t.riskLevel,
            });
          }
        }
      }
    } catch (err) {
      logger.error({ err, projectId }, "Error resolving project capabilities in BusinessAgent");
    }

    return capabilities;
  }

  /**
   * Main Execution Pipeline for AI Business Agent.
   */
  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const { projectId, userId, sessionId, payload } = context;
      const userMessage = payload?.message || payload?.intent || "";
      const confirmationToken = payload?.confirmationToken;

      if (!projectId) {
        return { success: false, error: "Project ID is required." };
      }

      // ─── STEP -1: DIRECT CONFIRMATION FAST-PATH ──────────────────────────
      if (confirmationToken) {
        const execResult = await executeServerTool({
          projectId,
          userId: userId || "public_visitor",
          sessionId: sessionId || "temp_session",
          toolId: payload?.actionId,
          actionName: payload?.actionName,
          input: payload?.input || {},
          confirmationToken,
          customerContext: context.customerContext
        });

        if (!execResult.success) {
          return {
            success: false,
            data: {
              intent: "action",
              status: execResult.status,
              toolExecuted: execResult.toolExecuted,
              response: execResult.error || "Action execution blocked or failed.",
            },
          };
        }

        const safeDataStr = JSON.stringify(execResult.data || {});
        return {
          success: true,
          data: {
            intent: "action",
            status: "COMPLETED",
            toolExecuted: execResult.toolExecuted,
            provider: execResult.provider,
            result: execResult.data,
            response: `Successfully executed ${execResult.toolExecuted}. Result: ${safeDataStr}`,
          },
        };
      }

      // ─── STEP 0: FAST DETERMINISTIC STANDALONE GENERAL CONVERSATION GUARD ─────────
      // Must match standalone conversational phrases ONLY. If message contains action verbs/inquiries (e.g. "hi, cancel my order"), it MUST NOT match here.
      const cleanLowerMsg = userMessage.trim().toLowerCase().replace(/[^\w\s]/g, "");
      const isGreeting = /^(hi|hello|hey|greetings|howdy|sup|good morning|good afternoon|good evening|good night|hello there|hi there|hey there)$/i.test(cleanLowerMsg);
      const isThanks = /^(thanks|thank you|thanks a lot|thank you so much|thx|ty)$/i.test(cleanLowerMsg);
      const isFarewell = /^(bye|goodbye|see you|see ya|later|take care|good night)$/i.test(cleanLowerMsg);
      const isSmalltalk = /^(how are you|how are you doing|hows it going|nice to meet you|okay|ok|great|cool|awesome)$/i.test(cleanLowerMsg);
      const isIdentityCap = /^(who are you|what are you|what can you do|what do you do|help|can you help me|what can you help me with|how can you help|hello what can you help me with)$/i.test(cleanLowerMsg);

      if (isGreeting || isThanks || isFarewell || isSmalltalk || isIdentityCap) {
        let generalReply = "Hello! How can I help you today?";
        if (isThanks) generalReply = "You're welcome! Let me know if there's anything else I can assist with.";
        if (isFarewell) generalReply = "Goodbye! Have a wonderful day!";
        if (isSmalltalk) generalReply = "I'm doing well, thank you! How can I help you today?";
        if (isIdentityCap) generalReply = "I am an AI Business Assistant. I can help answer questions about our business, check order statuses, or assist with supported services.";

        return {
          success: true,
          data: {
            intent: "general_conversation",
            response: generalReply,
          },
        };
      }

      // ─── STEP 1: ENTITLEMENT & SUBSCRIPTION CHECK ─────────────────────────
      const entitlement = await checkProjectEntitlement(projectId);
      if (!entitlement.allowed) {
        return {
          success: false,
          data: {
            intent: "unsupported",
            status: "ENTITLEMENT_EXPIRED",
            response: entitlement.message || "Your subscription or trial has expired. Please upgrade to continue.",
          },
        };
      }

      // ─── STEP 2: CAPABILITY & TOOL RESOLUTION ──────────────────────────────
      const capabilities = await this.getProjectCapabilities(projectId);
      const executableCapabilities = capabilities.filter((c) => c.status === "EXECUTABLE");

      // ─── STEP 3: INTENT & TOOL SELECTION BY LLM (UNTRUSTED INPUT) ─────────
      const systemPrompt = `You are NOVA AI's AI Business Agent.
Your job is to analyze the user's message, classify their intent into one of the exact categories below, and determine if an authorized business tool action should be executed or if a Knowledge Base response is required.

AVAILABLE EXECUTABLE TOOLS:
${JSON.stringify(executableCapabilities, null, 2)}

OTHER DISCOVERED CAPABILITIES (NOT YET AUTHORIZED):
${JSON.stringify(
  capabilities.filter((c) => c.status !== "EXECUTABLE"),
  null,
  2
)}

DIRECTIVES:
1. Intent MUST be one of: "general_conversation", "business_information", "customer_information", "action", "clarification", "unsupported".
2. "general_conversation": Greetings, farewells, thanks, small talk, identity questions, or capability questions. NO RAG, NO TOOL, NO CUSTOMER LOOKUP REQUIRED.
3. "business_information": User asks a question about policies, FAQs, product specs, services, business hours, or general company knowledge (e.g. "What is your refund policy?", "Tell about this website").
4. "customer_information": User asks about their personal customer data (e.g. "What is in my cart?", "Where is my order?").
5. "action": User asks to perform or execute a business tool action (e.g. "create product", "cancel order").
6. "clarification": User wants to perform an action, but required parameters are missing.
7. "unsupported": Capability is not authorized or supported.
8. If intent is "business_information" or "customer_information", also classify "ragIntent" into ONE of: "GENERAL_OVERVIEW", "FEATURES", "HOW_TO", "SPECIFIC_ENTITY", "AUTHENTICATION", "PRICING", "CONTACT", "TROUBLESHOOTING", "POLICY", "PERSONAL_DATA", "UNKNOWN".
9. Strictly return JSON format:
{
  "intent": "general_conversation | business_information | customer_information | action | clarification | unsupported",
  "ragIntent": "GENERAL_OVERVIEW | FEATURES | HOW_TO | SPECIFIC_ENTITY | ...",
  "selectedTool": "tool_name_or_null",
  "arguments": {},
  "missingInformation": ["param1"],
  "userExplanation": "Direct response to user"
}`;

      let llmDecision: any = { intent: "business_information", ragIntent: "UNKNOWN" };
      try {
        const aiRes = await ai.models.generateContent(userId || "system", {
          contents: [
            { role: "user", parts: [{ text: systemPrompt }] },
            { role: "user", parts: [{ text: `User Message: ${userMessage}` }] },
          ],
          config: { responseMimeType: "application/json" },
        });

        const jsonStr = aiRes.text?.replace(/```json/g, "").replace(/```/g, "").trim() || "{}";
        llmDecision = JSON.parse(jsonStr);
      } catch (e) {
        logger.warn({ err: e }, "Fallback to intent heuristic due to LLM decision error");
        // Resilient deterministic fallback
        const lowerMsg = userMessage.toLowerCase();
        let matchedTool = capabilities.find(c => lowerMsg.includes(c.name.toLowerCase()));
        if (!matchedTool) {
          matchedTool = capabilities.find(c => {
            const base = c.name.toLowerCase().replace(/^[a-z]+_/, "").replace(/_/g, " ");
            return lowerMsg.includes(c.providerId.toLowerCase()) && base.split(" ").some(w => lowerMsg.includes(w));
          });
        }

        if (matchedTool) {
          if (matchedTool.status !== "EXECUTABLE") {
            llmDecision = { intent: "unsupported", selectedTool: matchedTool.name };
          } else {
            llmDecision = { intent: "action", selectedTool: matchedTool.name };
          }
        } else if (lowerMsg.includes("whatsapp") || lowerMsg.includes("shopify") || lowerMsg.includes("slack")) {
          llmDecision = { intent: "unsupported" };
        } else {
          llmDecision = { intent: "business_information" };
        }
      }

      // ─── STEP 4: INTENT DISPATCH ──────────────────────────────────────────
      
      // Case 0: General Conversation -> Zero RAG, Zero Tool
      if (llmDecision.intent === "general_conversation") {
        return {
          success: true,
          data: {
            intent: "general_conversation",
            response: llmDecision.userExplanation || "Hello! How can I assist you today?",
          },
        };
      }

      // Case A: Business Information or Customer Information Request -> Execute RAG
      if (
        llmDecision.intent === "business_information" || 
        llmDecision.intent === "information" || 
        (!llmDecision.selectedTool)
      ) {
        
        // If customer_information is requested but we have no verified customer identity, reject immediately
        if (llmDecision.intent === "customer_information" && !context.customerContext?.verified) {
            return {
              success: true,
              data: {
                intent: "customer_information",
                response: "I cannot access private customer information because you are not authenticated.",
              }
            };
        }

        const ragRes = await searchProjectKnowledge({
          projectIds: [projectId],
          userId: userId || "public",
          customerId: context.customerContext?.customerId,
          query: userMessage,
          ragIntent: llmDecision.ragIntent,
        });

        const contextString = ragRes?.contextString;
        if (!contextString) {
          // If customer data was expected, return unsupported if no RAG data found and no tool triggered.
          if (llmDecision.intent === "customer_information" && !llmDecision.selectedTool) {
             return {
              success: true,
              data: {
                intent: "unsupported",
                response: "I could not find the requested customer information.",
              },
            };
          }
          return {
            success: true,
            data: {
              intent: "business_information",
              response: "I couldn't find that information in this website's connected knowledge.",
            },
          };
        }

        // Synthesize final response
        const synthesisPrompt = `You are a helpful AI Business Assistant. Answer the user's question using ONLY the provided knowledge context.
User Question: ${userMessage}

Context:
${contextString}

RULES:
- Answer the user's ACTUAL QUESTION first.
- If the knowledge base does not contain the answer, say "I couldn't find that information in this website's connected knowledge."
- DO NOT answer with a raw dump of the context. Provide a natural, cohesive answer.
- DO NOT expose internal source structure, IDs, tags, or metadata like "Category:", "Tag:", "Source URL:".
- For general overviews ("Tell about this website"), explain what the website is, what it helps users do, and its main features.
- Merge overlapping information naturally.
- Be concise. Simple questions get 2-6 short paragraphs/bullets. Detailed questions get more detail.
- Only provide a source link if the user asks for it or it's directly useful.`;

        const synthRes = await ai.models.generateContent(userId || "system", {
          contents: [{ role: "user", parts: [{ text: synthesisPrompt }] }],
        });

        return {
          success: true,
          data: {
            intent: llmDecision.intent,
            response: synthRes.text,
            retrievedIds: ragRes?.retrievedIds || [],
          },
        };
      }

      // Case B: Clarification Required
      if (
        llmDecision.intent === "clarification" ||
        (Array.isArray(llmDecision.missingInformation) && llmDecision.missingInformation.length > 0)
      ) {
        const missingList = (llmDecision.missingInformation || []).join(", ");
        return {
          success: true,
          data: {
            intent: "clarification",
            missingInformation: llmDecision.missingInformation,
            response:
              llmDecision.userExplanation ||
              `To assist with this action, please provide the required details: ${missingList}.`,
          },
        };
      }

      // Case C: Unsupported Action or Unauthorized Capability
      const targetToolName = llmDecision.selectedTool;
      const matchedCap = capabilities.find((c) => c.capabilityId === targetToolName || c.name === targetToolName);

      if (!matchedCap || matchedCap.status !== "EXECUTABLE") {
        return {
          success: true,
          data: {
            intent: "unsupported",
            response:
              matchedCap
                ? `The capability "${matchedCap.name}" is discovered but not yet authorized/connected. Please connect and authorize this integration in project settings.`
                : "The requested business action is not currently supported or authorized on this project.",
          },
        };
      }

      // Case D: Action Request -> Delegate strictly to executeServerTool Single Primitive
      const execResult = await executeServerTool({
        projectId,
        userId: userId || "public_visitor",
        sessionId: sessionId || "temp_session",
        actionName: targetToolName,
        input: llmDecision.arguments || {},
        confirmationToken,
        customerContext: context.customerContext
      });

      if (execResult.status === "PENDING_CONFIRMATION") {
        return {
          success: true,
          data: {
            intent: "action",
            status: "PENDING_CONFIRMATION",
            requiresConfirmation: true,
            actionId: execResult.actionId,
            confirmationToken: execResult.confirmationToken,
            expiresAt: execResult.expiresAt,
            riskLevel: execResult.riskLevel,
            toolExecuted: execResult.toolExecuted,
            provider: execResult.provider,
            response: `Confirmation required: Executing "${execResult.toolExecuted}" is classified as ${execResult.riskLevel} risk. Please confirm to proceed.`,
          },
        };
      }

      if (!execResult.success) {
        return {
          success: false,
          data: {
            intent: "action",
            status: execResult.status,
            toolExecuted: targetToolName,
            response: execResult.error || "Action execution blocked or failed.",
          },
        };
      }

      // Action succeeded - return sanitized truthful result
      const safeDataStr = JSON.stringify(execResult.data || {});
      return {
        success: true,
        data: {
          intent: "action",
          status: "COMPLETED",
          toolExecuted: execResult.toolExecuted,
          provider: execResult.provider,
          result: execResult.data,
          response: `Successfully executed ${execResult.toolExecuted}. Result: ${safeDataStr}`,
        },
      };
    } catch (err: any) {
      logger.error({ err }, "BusinessAgent unhandled error");
      return {
        success: false,
        error: err.message || "Internal BusinessAgent execution error.",
      };
    }
  }
}
