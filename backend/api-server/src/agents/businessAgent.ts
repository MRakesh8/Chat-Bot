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
      const systemPrompt = `You are RAGHUB's AI Business Agent.
Your job is to analyze the user's message, classify their intent, and determine if an authorized business tool action should be executed or if a factual Knowledge Base response is required.

AVAILABLE EXECUTABLE TOOLS:
${JSON.stringify(executableCapabilities, null, 2)}

OTHER DISCOVERED CAPABILITIES (NOT YET AUTHORIZED):
${JSON.stringify(
  capabilities.filter((c) => c.status !== "EXECUTABLE"),
  null,
  2
)}

DIRECTIVES:
1. Intent MUST be one of: "information", "action", "clarification", "unsupported".
2. "information": User asks a question about policies, FAQs, product details, services, business hours, or general project knowledge.
3. "action": User asks to perform or view data using an EXECUTABLE tool (e.g. "show me orders", "get products").
4. "clarification": User wants to perform an action, but required parameters (e.g. order ID, product name, email) are missing. Specify missing fields in missingInformation array. DO NOT GUESS OR INVENT PARAMETERS.
5. "unsupported": User asks for a capability that is DISCOVERED but not AUTHORIZED, or an action that does not exist.
6. Strictly return JSON format:
{
  "intent": "information | action | clarification | unsupported",
  "selectedTool": "tool_name_or_null",
  "arguments": {},
  "missingInformation": ["param1"],
  "userExplanation": "Direct response to user"
}`;

      let llmDecision: any = { intent: "information" };
      try {
        const aiRes = await ai.models.generateContent(userId || "system", {
          model: "gemini-2.0-flash",
          contents: [
            { role: "user", parts: [{ text: systemPrompt }] },
            { role: "user", parts: [{ text: `User Message: ${userMessage}` }] },
          ],
          config: { responseMimeType: "application/json" },
        });

        const jsonStr = aiRes.text?.replace(/```json/g, "").replace(/```/g, "").trim() || "{}";
        llmDecision = JSON.parse(jsonStr);
      } catch (e) {
        logger.warn({ err: e }, "Fallback to information intent due to LLM decision parse error");
        llmDecision = { intent: "information" };
      }

      // ─── STEP 4: INTENT DISPATCH ──────────────────────────────────────────
      
      // Case A: Information Request -> Execute RAG
      if (llmDecision.intent === "information" || !llmDecision.selectedTool) {
        const ragRes = await searchProjectKnowledge({
          projectIds: [projectId],
          userId: userId || "public",
          query: userMessage,
        });

        const contextString = ragRes?.contextString;
        if (!contextString) {
          return {
            success: true,
            data: {
              intent: "information",
              response: "Relevant information was not found in this project's Knowledge Base.",
            },
          };
        }

        return {
          success: true,
          data: {
            intent: "information",
            response: contextString,
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
        confirmationToken
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
