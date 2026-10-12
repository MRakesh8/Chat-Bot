import { BaseAgent, AgentContext, AgentResult } from "./base";
import { ai } from "@workspace/integrations-gemini-ai";
import { db } from "@workspace/db";
import { projectApiKeys } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { crypto } from "@workspace/db";
import { GoogleGenAI } from "@google/genai";
import nodeCrypto from "crypto";
import { llmResponseCache } from "../services/cache-provider";
import { evaluateUnifiedActionRisk, requiresConfirmation } from "../security/agentSafety";

export interface WorkflowStep {
  stepId: string;
  actionType: string;
  description: string;
  input: Record<string, any>;
  dependsOn?: string[];
  inputMapping?: Record<string, string>;
  riskLevel: "READ_ONLY" | "LOW_RISK_WRITE" | "HIGH_RISK_WRITE" | "IRREVERSIBLE";
  requiresConfirmation: boolean;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED" | "PENDING_APPROVAL";
  result?: any;
  error?: string;
  verification?: any;
}

export interface PlanWorkflowParams {
  intent: string;
  projectId: string;
  availableTools: any[]; // ToolDefinition or CapabilityStatus
  currentUrl?: string;
  websiteContext?: any;
  customerContext?: any;
  previousSteps?: WorkflowStep[];
}

export interface PlanWorkflowResult {
  success: boolean;
  isMultiStep: boolean;
  status: "PLANNED" | "UNAVAILABLE_TOOL" | "MISSING_INFORMATION" | "NO_ACTION_REQUIRED" | "PLANNING_FAILED";
  reason?: string;
  missingInformation?: string[];
  steps: WorkflowStep[];
  estimatedTotalSteps: number;
}

export class PlannerAgent extends BaseAgent {
  constructor() {
    super("PlannerAgent");
  }

  /**
   * Universal Task Planner:
   * Plans single-step or multi-step workflows for both server integration tools and browser DOM actions.
   * Strictly enforces tool availability, dependencies, and parameter prerequisites.
   */
  async planWorkflow(params: PlanWorkflowParams): Promise<PlanWorkflowResult> {
    const {
      intent,
      projectId,
      availableTools = [],
      customerContext,
      previousSteps = [],
    } = params;

    const trimmedIntent = (intent || "").trim();
    if (!trimmedIntent) {
      return {
        success: false,
        isMultiStep: false,
        status: "NO_ACTION_REQUIRED",
        reason: "Intent is empty.",
        steps: [],
        estimatedTotalSteps: 0,
      };
    }

    const lowerIntent = trimmedIntent.toLowerCase();

    // 1. Authoritative Tool Availability Gate:
    // Extract tool names that are executable for this project
    const executableToolNames = new Set(
      availableTools
        .filter((t: any) => t.status === "EXECUTABLE" || !t.status)
        .map((t: any) => t.actionName || t.capabilityId || t.name)
    );

    // Check for explicit requests to unsupported external platforms or actions
    const unsupportedKeywords = [
      { trigger: "slack", label: "Slack" },
      { trigger: "hubspot", label: "HubSpot" },
      { trigger: "jira", label: "Jira" },
      { trigger: "stripe_refund", label: "Stripe Refund" },
      { trigger: "whatsapp_broadcast", label: "WhatsApp Broadcast" },
      { trigger: "drop table", label: "SQL Execution" },
      { trigger: "database export", label: "Database Export" },
    ];

    for (const unsupp of unsupportedKeywords) {
      if (lowerIntent.includes(unsupp.trigger)) {
        const hasMatchingTool = Array.from(executableToolNames).some(name => name.toLowerCase().includes(unsupp.trigger));
        if (!hasMatchingTool) {
          return {
            success: false,
            isMultiStep: false,
            status: "UNAVAILABLE_TOOL",
            reason: `Action or integration '${unsupp.label}' is not authorized, connected, or executable for this project.`,
            steps: [],
            estimatedTotalSteps: 0,
          };
        }
      }
    }

    // 2. Deterministic Proportional Planning for Known Multi-Step & Single-Step Patterns
    // Multi-Step Pattern A: Find product and update price / details
    const isFindAndUpdateProduct =
      (lowerIntent.includes("find product") || lowerIntent.includes("search product") || lowerIntent.includes("get product") || lowerIntent.includes("look up product")) &&
      (lowerIntent.includes("update") || lowerIntent.includes("change price") || lowerIntent.includes("set price"));

    if (isFindAndUpdateProduct) {
      if (!executableToolNames.has("shopify_get_products") || !executableToolNames.has("shopify_update_product")) {
        return {
          success: false,
          isMultiStep: false,
          status: "UNAVAILABLE_TOOL",
          reason: "Required tools ('shopify_get_products' or 'shopify_update_product') are not available on this project.",
          steps: [],
          estimatedTotalSteps: 0,
        };
      }

      // Check if price is provided in intent
      const priceMatch = lowerIntent.match(/(?:price\s*(?:to|=)?\s*\$?|to\s*\$?)(\d+(?:\.\d{1,2})?)/);
      const newPrice = priceMatch ? priceMatch[1] : undefined;

      if (!newPrice) {
        return {
          success: false,
          isMultiStep: false,
          status: "MISSING_INFORMATION",
          missingInformation: ["price"],
          reason: "Please specify the new price to update the product.",
          steps: [],
          estimatedTotalSteps: 0,
        };
      }

      const step1: WorkflowStep = {
        stepId: "step_1",
        actionType: "shopify_get_products",
        description: "Retrieve store products to resolve target product ID",
        input: { limit: 20 },
        riskLevel: "READ_ONLY",
        requiresConfirmation: false,
        status: "PENDING",
      };

      const step2: WorkflowStep = {
        stepId: "step_2",
        actionType: "shopify_update_product",
        description: `Update product price to $${newPrice}`,
        input: { price: newPrice },
        dependsOn: ["step_1"],
        inputMapping: { productId: "$step_1.data.products[0].id" },
        riskLevel: "LOW_RISK_WRITE",
        requiresConfirmation: false,
        status: "PENDING",
      };

      return {
        success: true,
        isMultiStep: true,
        status: "PLANNED",
        steps: [step1, step2],
        estimatedTotalSteps: 2,
      };
    }

    // Multi-Step Pattern B: Check orders and cancel specific order
    const isCheckAndCancelOrder =
      (lowerIntent.includes("check order") || lowerIntent.includes("find order") || lowerIntent.includes("get orders") || lowerIntent.includes("look up order")) &&
      lowerIntent.includes("cancel");

    if (isCheckAndCancelOrder) {
      if (!executableToolNames.has("shopify_get_orders") || !executableToolNames.has("shopify_cancel_order")) {
        return {
          success: false,
          isMultiStep: false,
          status: "UNAVAILABLE_TOOL",
          reason: "Required tools ('shopify_get_orders' or 'shopify_cancel_order') are not available on this project.",
          steps: [],
          estimatedTotalSteps: 0,
        };
      }

      const step1: WorkflowStep = {
        stepId: "step_1",
        actionType: "shopify_get_orders",
        description: "Retrieve store orders to locate order details",
        input: { limit: 50 },
        riskLevel: "READ_ONLY",
        requiresConfirmation: false,
        status: "PENDING",
      };

      const step2: WorkflowStep = {
        stepId: "step_2",
        actionType: "shopify_cancel_order",
        description: "Cancel target order (Requires human confirmation)",
        input: {},
        dependsOn: ["step_1"],
        inputMapping: { orderId: "$step_1.data.orders[0].id" },
        riskLevel: "HIGH_RISK_WRITE",
        requiresConfirmation: true,
        status: "PENDING",
      };

      return {
        success: true,
        isMultiStep: true,
        status: "PLANNED",
        steps: [step1, step2],
        estimatedTotalSteps: 2,
      };
    }

    // Single-Step Pattern C: Cancel Order directly
    if (lowerIntent.includes("cancel order") || lowerIntent.includes("cancel my order")) {
      if (!executableToolNames.has("shopify_cancel_order")) {
        return {
          success: false,
          isMultiStep: false,
          status: "UNAVAILABLE_TOOL",
          reason: "Tool 'shopify_cancel_order' is not authorized or connected on this project.",
          steps: [],
          estimatedTotalSteps: 0,
        };
      }

      const orderMatch = lowerIntent.match(/(?:order\s*(?:#|id)?\s*)(\d+)/i);
      const orderId = orderMatch ? orderMatch[1] : undefined;

      if (!orderId && !customerContext?.customerId) {
        return {
          success: false,
          isMultiStep: false,
          status: "MISSING_INFORMATION",
          missingInformation: ["orderId"],
          reason: "Please provide the order number or ID to cancel.",
          steps: [],
          estimatedTotalSteps: 0,
        };
      }

      const step: WorkflowStep = {
        stepId: "step_1",
        actionType: "shopify_cancel_order",
        description: `Cancel order #${orderId || customerContext?.customerId}`,
        input: { orderId: orderId || customerContext?.customerId },
        riskLevel: "HIGH_RISK_WRITE",
        requiresConfirmation: true,
        status: "PENDING",
      };

      return {
        success: true,
        isMultiStep: false,
        status: "PLANNED",
        steps: [step],
        estimatedTotalSteps: 1,
      };
    }

    // Single-Step Pattern D: Delete Product directly
    if (lowerIntent.includes("delete product") || lowerIntent.includes("remove product")) {
      if (!executableToolNames.has("shopify_delete_product")) {
        return {
          success: false,
          isMultiStep: false,
          status: "UNAVAILABLE_TOOL",
          reason: "Tool 'shopify_delete_product' is not authorized or connected on this project.",
          steps: [],
          estimatedTotalSteps: 0,
        };
      }

      const idMatch = lowerIntent.match(/(?:product\s*(?:#|id)?\s*)(\d+)/i);
      const productId = idMatch ? idMatch[1] : undefined;

      if (!productId) {
        return {
          success: false,
          isMultiStep: false,
          status: "MISSING_INFORMATION",
          missingInformation: ["productId"],
          reason: "Please provide the product ID to delete.",
          steps: [],
          estimatedTotalSteps: 0,
        };
      }

      const step: WorkflowStep = {
        stepId: "step_1",
        actionType: "shopify_delete_product",
        description: `Permanently delete product ${productId} (Irreversible)`,
        input: { productId },
        riskLevel: "IRREVERSIBLE",
        requiresConfirmation: true,
        status: "PENDING",
      };

      return {
        success: true,
        isMultiStep: false,
        status: "PLANNED",
        steps: [step],
        estimatedTotalSteps: 1,
      };
    }

    // Single-Step Pattern E: Get products or orders directly
    if (lowerIntent.includes("products") || lowerIntent.includes("catalog") || lowerIntent.includes("inventory")) {
      if (executableToolNames.has("shopify_get_products")) {
        return {
          success: true,
          isMultiStep: false,
          status: "PLANNED",
          steps: [
            {
              stepId: "step_1",
              actionType: "shopify_get_products",
              description: "Retrieve store products",
              input: { limit: 50 },
              riskLevel: "READ_ONLY",
              requiresConfirmation: false,
              status: "PENDING",
            },
          ],
          estimatedTotalSteps: 1,
        };
      }
    }

    if (lowerIntent.includes("orders") || lowerIntent.includes("sales")) {
      if (executableToolNames.has("shopify_get_orders")) {
        return {
          success: true,
          isMultiStep: false,
          status: "PLANNED",
          steps: [
            {
              stepId: "step_1",
              actionType: "shopify_get_orders",
              description: "Retrieve store orders",
              input: { limit: 50 },
              riskLevel: "READ_ONLY",
              requiresConfirmation: false,
              status: "PENDING",
            },
          ],
          estimatedTotalSteps: 1,
        };
      }
    }

    // 3. Fallback to LLM-Driven Dynamic Planning for arbitrary multi-tool workflows
    return await this.planWithLLM({
      intent: trimmedIntent,
      projectId,
      availableTools,
      customerContext,
      previousSteps,
    });
  }

  /**
   * LLM-driven planning engine with structured output and failure handling.
   */
  private async planWithLLM(params: PlanWorkflowParams): Promise<PlanWorkflowResult> {
    const { intent, projectId, availableTools } = params;

    try {
      const [keyData] = await db
        .select()
        .from(projectApiKeys)
        .where(eq(projectApiKeys.projectId, projectId));

      const activeKey = keyData ? crypto.decrypt(keyData.encryptedKey) : "";
      const effectiveKey = activeKey || process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";

      if (!effectiveKey) {
        return {
          success: false,
          isMultiStep: false,
          status: "PLANNING_FAILED",
          reason: "No active API key found for planning.",
          steps: [],
          estimatedTotalSteps: 0,
        };
      }

      const directClient = new GoogleGenAI({ apiKey: effectiveKey });

      const toolsSummary = availableTools.map((t: any) => ({
        name: t.actionName || t.capabilityId || t.name,
        description: t.description || "",
        riskLevel: t.riskLevel || "READ_ONLY",
        inputSchema: t.inputSchema || {},
      }));

      const systemPrompt = `You are the NOVA AI Task Planner.
Translate user requests into an ordered sequence of executable tool steps.

AVAILABLE TOOLS (ONLY select from these tools):
${JSON.stringify(toolsSummary, null, 2)}

RULES:
1. ONLY select tools that appear in the AVAILABLE TOOLS list.
2. If the user request requires a tool NOT in the available tools list, set "status": "UNAVAILABLE_TOOL" and provide "reason".
3. If essential parameters are missing that cannot be inferred from a prior step, set "status": "MISSING_INFORMATION" and list "missingInformation".
4. For multi-step tasks, link dependent inputs using "$step_1.data.path" notation in "inputMapping".
5. Return JSON format ONLY:
{
  "status": "PLANNED | UNAVAILABLE_TOOL | MISSING_INFORMATION",
  "isMultiStep": boolean,
  "reason": "explanation if not planned",
  "missingInformation": ["field1"],
  "steps": [
    {
      "stepId": "step_1",
      "actionType": "exact_tool_name",
      "description": "Short explanation",
      "input": {},
      "dependsOn": [],
      "inputMapping": {},
      "riskLevel": "READ_ONLY | LOW_RISK_WRITE | HIGH_RISK_WRITE | IRREVERSIBLE"
    }
  ]
}`;

      const response = await directClient.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          { role: "user", parts: [{ text: systemPrompt }] },
          { role: "user", parts: [{ text: `User Request: ${intent}` }] },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });

      const parsed = JSON.parse(response.text || "{}");

      if (parsed.status === "UNAVAILABLE_TOOL") {
        return {
          success: false,
          isMultiStep: false,
          status: "UNAVAILABLE_TOOL",
          reason: parsed.reason || "Required tool is unavailable.",
          steps: [],
          estimatedTotalSteps: 0,
        };
      }

      if (parsed.status === "MISSING_INFORMATION") {
        return {
          success: false,
          isMultiStep: false,
          status: "MISSING_INFORMATION",
          missingInformation: parsed.missingInformation || [],
          reason: parsed.reason || "Missing required information.",
          steps: [],
          estimatedTotalSteps: 0,
        };
      }

      const generatedSteps: WorkflowStep[] = (parsed.steps || []).map((s: any, idx: number) => {
        const riskLevel = s.riskLevel || evaluateUnifiedActionRisk(s.actionType);
        return {
          stepId: s.stepId || `step_${idx + 1}`,
          actionType: s.actionType,
          description: s.description || `Execute ${s.actionType}`,
          input: s.input || {},
          dependsOn: s.dependsOn || [],
          inputMapping: s.inputMapping || {},
          riskLevel,
          requiresConfirmation: riskLevel === "HIGH_RISK_WRITE" || riskLevel === "IRREVERSIBLE" || requiresConfirmation(s.actionType),
          status: "PENDING",
        };
      });

      return {
        success: generatedSteps.length > 0,
        isMultiStep: generatedSteps.length > 1,
        status: generatedSteps.length > 0 ? "PLANNED" : "PLANNING_FAILED",
        steps: generatedSteps,
        estimatedTotalSteps: generatedSteps.length,
      };
    } catch (err: any) {
      return {
        success: false,
        isMultiStep: false,
        status: "PLANNING_FAILED",
        reason: err.message || "Dynamic planning failed.",
        steps: [],
        estimatedTotalSteps: 0,
      };
    }
  }

  /**
   * Backwards compatible browser execution planner for DOM actions.
   */
  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const { projectId, payload } = context;
      const intent = payload?.intent || payload?.message || "Unknown intent";
      const currentUrl = payload?.currentUrl || "";
      const websiteContext = payload?.context || "No context provided.";

      const planRes = await this.planWorkflow({
        intent,
        projectId,
        availableTools: payload?.availableTools || [],
        currentUrl,
        websiteContext,
      });

      if (planRes.success && planRes.steps.length > 0) {
        return {
          success: true,
          data: {
            plan: {
              goal: intent,
              steps: planRes.steps,
              currentStepIndex: 0,
            },
          },
          confidenceScore: 0.95,
        };
      }

      // Legacy fallback for DOM browser actions
      return {
        success: false,
        error: planRes.reason || "Planning failed or unsupported.",
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
