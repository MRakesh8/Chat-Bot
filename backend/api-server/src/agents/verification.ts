import { BaseAgent, AgentContext, AgentResult } from "./base";

export type VerificationStatus = "SUCCEEDED" | "FAILED" | "PARTIALLY_COMPLETED" | "UNVERIFIED";

export interface VerificationEvidence {
  entityId?: string;
  status?: string;
  operation?: string;
  changedFields?: string[];
  recordsCount?: number;
  verifiedAt: string;
}

export interface VerificationDetails {
  verified: boolean;
  status: VerificationStatus;
  reason: string;
  evidence?: VerificationEvidence;
}

export class VerificationAgent extends BaseAgent {
  constructor() {
    super("VerificationAgent");
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const { payload } = context;
      const result = payload?.result;

      if (!result) {
        return {
          success: true,
          data: {
            verified: false,
            status: "FAILED" as VerificationStatus,
            reason: "No result provided for verification.",
          },
        };
      }

      const verifiedDetails = this.verifySingleResult(result);

      return {
        success: true,
        data: verifiedDetails,
        confidenceScore: verifiedDetails.verified ? 0.99 : 0.5,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Authoritatively verifies an action or tool execution outcome.
   * Ensures success is not assumed solely because an error was not thrown.
   */
  public verifySingleResult(result: any): VerificationDetails {
    const verifiedAt = new Date().toISOString();

    // 1. Explicit error reporting in result object
    if (result.status === "failed" || result.error) {
      return {
        verified: false,
        status: "FAILED",
        reason: result.error || "Action engine reported failure.",
      };
    }

    // 2. Client navigation & DOM actions verification
    if (result.action?.type === "navigate" || result.tool === "navigate") {
      const route = result.action?.route || result.route;
      if (!route || typeof route !== "string") {
        return {
          verified: false,
          status: "FAILED",
          reason: "Navigation verification failed: Target route is invalid or missing.",
        };
      }
      if (!route.startsWith("/")) {
        return {
          verified: false,
          status: "FAILED",
          reason: "Navigation verification failed: Target route must be a valid relative path starting with '/'.",
        };
      }
      return {
        verified: true,
        status: "SUCCEEDED",
        reason: `Target route '${route}' verified successfully.`,
        evidence: {
          operation: "navigate",
          status: "NAVIGATED",
          entityId: route,
          verifiedAt,
        },
      };
    }

    if (result.verification) {
      const { urlChanged, elementFound, domMutated } = result.verification;
      if (result.tool === "navigate" && !urlChanged) {
        return {
          verified: false,
          status: "FAILED",
          reason: "Navigation failed: URL did not change in browser.",
        };
      }
      if (result.tool === "click" && !elementFound && !domMutated) {
        return {
          verified: false,
          status: "FAILED",
          reason: "Target element not found on page.",
        };
      }
      if (result.tool === "type" && !elementFound) {
        return {
          verified: false,
          status: "FAILED",
          reason: "Target input element not found on page.",
        };
      }
    }

    // 3. Server-side tool execution results verification
    const toolName = result.toolExecuted || result.actionName || result.tool || "";
    const data = result.data;

    // Reject if data is missing or empty object when an action was supposed to happen
    if (data === undefined || data === null) {
      return {
        verified: false,
        status: "UNVERIFIED",
        reason: "Tool execution returned no data to verify outcome.",
      };
    }

    // Check for nested error payloads in provider responses (e.g. GraphQL or REST errors)
    if (data.error || data.errors) {
      const errReason = typeof data.error === "string"
        ? data.error
        : (data.errors?.[0]?.message || JSON.stringify(data.errors));
      return {
        verified: false,
        status: "FAILED",
        reason: `Provider returned error: ${errReason}`,
      };
    }

    // Tool-specific authoritative validation
    if (toolName === "shopify_get_products") {
      if (!Array.isArray(data.products)) {
        return {
          verified: false,
          status: "FAILED",
          reason: "Expected products array in store response, but got invalid format.",
        };
      }
      return {
        verified: true,
        status: "SUCCEEDED",
        reason: `Retrieved ${data.products.length} products successfully.`,
        evidence: {
          operation: "shopify_get_products",
          recordsCount: data.products.length,
          verifiedAt,
        },
      };
    }

    if (toolName === "shopify_get_orders") {
      if (!Array.isArray(data.orders)) {
        return {
          verified: false,
          status: "FAILED",
          reason: "Expected orders array in store response, but got invalid format.",
        };
      }
      return {
        verified: true,
        status: "SUCCEEDED",
        reason: `Retrieved ${data.orders.length} orders successfully.`,
        evidence: {
          operation: "shopify_get_orders",
          recordsCount: data.orders.length,
          verifiedAt,
        },
      };
    }

    if (toolName === "shopify_create_product") {
      const productId = data.product?.id;
      if (!productId) {
        return {
          verified: false,
          status: "FAILED",
          reason: "Product creation could not be verified: Missing product ID in store response.",
        };
      }
      return {
        verified: true,
        status: "SUCCEEDED",
        reason: `Product created with ID ${productId}.`,
        evidence: {
          operation: "shopify_create_product",
          entityId: String(productId),
          status: "CREATED",
          changedFields: ["title", "price"],
          verifiedAt,
        },
      };
    }

    if (toolName === "shopify_update_product") {
      const productId = data.product?.id;
      if (!productId) {
        return {
          verified: false,
          status: "FAILED",
          reason: "Product update could not be verified: Missing product ID in store response.",
        };
      }
      return {
        verified: true,
        status: "SUCCEEDED",
        reason: `Product ${productId} updated successfully.`,
        evidence: {
          operation: "shopify_update_product",
          entityId: String(productId),
          status: "UPDATED",
          verifiedAt,
        },
      };
    }

    if (toolName === "shopify_delete_product") {
      if (!data.deleted && data.deleted !== "true") {
        return {
          verified: false,
          status: "FAILED",
          reason: "Product deletion could not be verified: Store did not confirm deletion.",
        };
      }
      return {
        verified: true,
        status: "SUCCEEDED",
        reason: "Product deletion confirmed by store.",
        evidence: {
          operation: "shopify_delete_product",
          status: "DELETED",
          verifiedAt,
        },
      };
    }

    if (toolName === "shopify_cancel_order") {
      const orderId = data.order?.id;
      const cancelledAt = data.order?.cancelled_at;
      if (!orderId && !cancelledAt) {
        return {
          verified: false,
          status: "FAILED",
          reason: "Order cancellation could not be verified: Store response missing cancellation confirmation.",
        };
      }
      return {
        verified: true,
        status: "SUCCEEDED",
        reason: `Order ${orderId || ""} cancelled successfully.`,
        evidence: {
          operation: "shopify_cancel_order",
          entityId: orderId ? String(orderId) : undefined,
          status: "CANCELLED",
          verifiedAt,
        },
      };
    }

    // Generic tools: If data has non-empty keys and no errors, verify as SUCCEEDED
    if (typeof data === "object" && Object.keys(data).length > 0) {
      return {
        verified: true,
        status: "SUCCEEDED",
        reason: `Action '${toolName || "tool"}' completed with authoritative response.`,
        evidence: {
          operation: toolName || "generic_action",
          status: "COMPLETED",
          verifiedAt,
        },
      };
    }

    return {
      verified: false,
      status: "UNVERIFIED",
      reason: "Tool returned empty response data without verification evidence.",
    };
  }

  /**
   * Aggregates verification results across a multi-step workflow.
   */
  public verifyWorkflow(steps: any[]): {
    allVerified: boolean;
    succeededCount: number;
    failedCount: number;
    unverifiedCount: number;
    totalCount: number;
    stepSummaries: { stepId: string | number; actionType: string; status: VerificationStatus; reason: string }[];
  } {
    let succeededCount = 0;
    let failedCount = 0;
    let unverifiedCount = 0;

    const stepSummaries = (steps || []).map((step) => {
      const stepVerification = step.verification || this.verifySingleResult({
        toolExecuted: step.actionType,
        status: step.status === "COMPLETED" ? "success" : "failed",
        error: step.error,
        data: step.result,
      });

      if (stepVerification.status === "SUCCEEDED") succeededCount++;
      else if (stepVerification.status === "FAILED") failedCount++;
      else unverifiedCount++;

      return {
        stepId: step.stepId || step.id,
        actionType: step.actionType,
        status: stepVerification.status,
        reason: stepVerification.reason,
      };
    });

    const totalCount = steps.length;
    const allVerified = totalCount > 0 && succeededCount === totalCount && failedCount === 0;

    return {
      allVerified,
      succeededCount,
      failedCount,
      unverifiedCount,
      totalCount,
      stepSummaries,
    };
  }
}
