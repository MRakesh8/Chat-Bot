import {
  db,
  projects,
  projectIntegrations,
  integrationTools,
  websitePermissions,
  crypto,
  withTenantContext,
  enterpriseAuditLogs,
  executionSteps,
  users,
  organizationMembers
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { providerRegistry } from "./integrations/provider-registry";
import { checkProjectEntitlement } from "../security/entitlement";
import { checkAndIncrementUsage, refundUsage } from "../security/quota";
import {
  evaluateActionRisk,
  requiresConfirmation,
  generateActionConfirmationToken,
  verifyActionConfirmationToken
} from "../security/agentSafety";
import { VerificationAgent } from "../agents/verification";
import { logger } from "../lib/logger";
import { isDemoProjectId } from "./demo-project";
import { emitActivityEvent } from "./activity";
import { createNotification } from "./notifications";
import { isExecutionCancelled, isExecutionCancelledAsync } from "./execution-governance";

export interface CustomerContext {
  customerId?: string;
  email?: string;
  phone?: string;
  verified?: boolean;
  isBusinessAdmin?: boolean;
}

export interface ExecuteServerToolParams {
  projectId: string;
  orgId?: string;
  userId?: string;
  sessionId?: string;
  executionId?: string;
  toolId?: string;
  actionName?: string;
  input?: any;
  confirmationToken?: string;
  customerContext?: CustomerContext;
  idempotencyKey?: string;
  timeoutMs?: number;
}

export interface ExecuteServerToolResult {
  success: boolean;
  status: "COMPLETED" | "PENDING_CONFIRMATION" | "EXECUTION_FAILED" | "FORBIDDEN" | "QUOTA_EXCEEDED" | "ENTITLEMENT_EXPIRED" | "INVALID_CONFIRMATION_TOKEN" | "INVALID_INPUT" | "TIMEOUT";
  data?: any;
  error?: string;
  requiresConfirmation?: boolean;
  actionId?: string;
  confirmationToken?: string;
  expiresAt?: Date;
  riskLevel?: string;
  toolExecuted?: string;
  provider?: string;
  isIdempotentReplay?: boolean;
  verification?: any;
}

const verificationAgent = new VerificationAgent();

export const idempotencyCache = new Map<string, { result: ExecuteServerToolResult; timestamp: number }>();

export function validateToolSchema(schema: any, input: any): { valid: boolean; error?: string } {
  if (!schema) return { valid: true };
  if (typeof schema.safeParse === "function") {
    const res = schema.safeParse(input);
    if (!res.success) {
      const issues = res.error?.issues?.map((i: any) => `${i.path.join('.') || 'input'}: ${i.message}`).join(', ') || "Schema validation failed";
      return { valid: false, error: issues };
    }
    return { valid: true };
  }
  if (schema.type === "object" || schema.required || schema.properties) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const reqField of required) {
      if (input === undefined || input === null || input[reqField] === undefined || input[reqField] === null || input[reqField] === "") {
        return { valid: false, error: `Missing required field '${reqField}'` };
      }
    }
    if (schema.properties && input && typeof input === "object") {
      for (const [propName, propDef] of Object.entries<any>(schema.properties)) {
        const val = input[propName];
        if (val !== undefined && val !== null) {
          if (propDef.type === "string" && typeof val !== "string") {
            return { valid: false, error: `Field '${propName}' must be a string` };
          }
          if (propDef.type === "number" && typeof val !== "number" && isNaN(Number(val))) {
            return { valid: false, error: `Field '${propName}' must be a number` };
          }
          if (propDef.type === "array" && !Array.isArray(val)) {
            return { valid: false, error: `Field '${propName}' must be an array` };
          }
        }
      }
    }
  }
  return { valid: true };
}

/**
 * Authoritative, deterministic server-side execution primitive for Phase 2E/2F tools.
 * Independently enforces tenant isolation, entitlement, DB tool authorization,
 * permissions/RBAC, quota, risk level, schema validation, idempotency, and confirmation validation.
 */
export async function executeServerTool(
  params: ExecuteServerToolParams
): Promise<ExecuteServerToolResult> {
  const {
    projectId,
    orgId,
    userId = "public_visitor",
    sessionId = "default_session",
    executionId,
    toolId,
    actionName,
    input = {},
    confirmationToken,
    customerContext,
    idempotencyKey,
    timeoutMs = 15000
  } = params;

  // Check idempotency cache first
  if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
    const cached = idempotencyCache.get(idempotencyKey)!;
    const now = Date.now();
    if (now - cached.timestamp < 10 * 60 * 1000) { // 10 minutes cache TTL
      return {
        ...cached.result,
        isIdempotentReplay: true,
      };
    } else {
      idempotencyCache.delete(idempotencyKey);
    }
  }

  const executionStart = Date.now();

  if (executionId) {
    if (isExecutionCancelled(executionId) || (await isExecutionCancelledAsync(executionId))) {
      return {
        success: false,
        status: "EXECUTION_FAILED",
        error: "Execution run was cancelled by user.",
      };
    }
  }

  if (!projectId) {
    return {
      success: false,
      status: "EXECUTION_FAILED",
      error: "Missing required projectId"
    };
  }

  if (isDemoProjectId(projectId)) {
    return {
      success: false,
      status: "FORBIDDEN",
      error: "🧪 This is a demo project. Real business actions are disabled here."
    };
  }

  if (!toolId && !actionName) {
    return {
      success: false,
      status: "EXECUTION_FAILED",
      error: "Must specify either toolId or actionName for execution"
    };
  }

  try {
    let isSuperAdmin = false;
    let isBusinessAdmin = false;
    
    if (userId && userId !== "public_visitor" && userId !== "whatsapp_contact") {
      try {
        const [dbUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
        if (dbUser?.role === "super_admin") {
          isSuperAdmin = true;
          isBusinessAdmin = true;
        }
      } catch (e) {
        // Safe fallback
      }
    }

    // 1. Authoritative Project & Organization Verification
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      return {
        success: false,
        status: "FORBIDDEN",
        error: "Project not found or access denied."
      };
    }

    if (orgId && project.organizationId !== orgId) {
      return {
        success: false,
        status: "FORBIDDEN",
        error: "Tenant isolation violation: Project does not belong to user organization."
      };
    }

    const effectiveOrgId = orgId || project.organizationId;

    if (!isSuperAdmin && effectiveOrgId) {
      if (userId && userId !== "public_visitor" && userId !== "whatsapp_contact") {
        const [membership] = await db
          .select({ role: organizationMembers.role })
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, effectiveOrgId), eq(organizationMembers.userId, userId)))
          .limit(1);

        if (membership) {
          if (membership.role === "owner" || membership.role === "admin" || membership.role === "manager") {
            isBusinessAdmin = true;
          }
        } else if (project.userId === userId) {
          isBusinessAdmin = true;
        } else {
          return {
            success: false,
            status: "FORBIDDEN",
            error: "Tenant isolation violation: User is not a member of the project organization."
          };
        }
      }
    }

    // 2. Authoritative Project Entitlement Check
    const entitlement = await checkProjectEntitlement(projectId, isSuperAdmin);
    if (!entitlement.allowed) {
      return {
        success: false,
        status: "ENTITLEMENT_EXPIRED",
        error: entitlement.message || "Project subscription or trial has expired."
      };
    }

    // 3. Resolve Tool and Parent Integration from Database with Tenant Boundaries
    let matchedTool: any = null;
    let parentIntegration: any = null;

    if (toolId) {
      const [t] = await db
        .select()
        .from(integrationTools)
        .where(and(eq(integrationTools.id, toolId), eq(integrationTools.projectId, projectId)));
      matchedTool = t;
    } else if (actionName) {
      const [t] = await db
        .select()
        .from(integrationTools)
        .where(and(eq(integrationTools.actionName, actionName), eq(integrationTools.projectId, projectId)));
      matchedTool = t;
    }

    if (!matchedTool) {
      return {
        success: false,
        status: "FORBIDDEN",
        error: `Tool ${toolId || actionName} is not registered for this project.`
      };
    }

    if (!matchedTool.isEnabled) {
      return {
        success: false,
        status: "FORBIDDEN",
        error: `Tool ${matchedTool.actionName} is currently disabled.`
      };
    }

    if (matchedTool.status !== "EXECUTABLE") {
      return {
        success: false,
        status: "FORBIDDEN",
        error: `Tool ${matchedTool.actionName} is in ${matchedTool.status} status and cannot be executed.`
      };
    }

    // Lookup Parent Integration
    const [integ] = await db
      .select()
      .from(projectIntegrations)
      .where(and(eq(projectIntegrations.id, matchedTool.integrationId), eq(projectIntegrations.projectId, projectId)));

    parentIntegration = integ;

    if (!parentIntegration) {
      return {
        success: false,
        status: "FORBIDDEN",
        error: "Parent integration not found for this project."
      };
    }

    if (parentIntegration.status !== "AUTHORIZED") {
      return {
        success: false,
        status: "FORBIDDEN",
        error: `Parent integration ${parentIntegration.provider} is not AUTHORIZED (status: ${parentIntegration.status}).`
      };
    }

    if (!parentIntegration.encryptedCredentials) {
      return {
        success: false,
        status: "EXECUTION_FAILED",
        error: `Missing credentials for integration ${parentIntegration.provider}.`
      };
    }

    // 4. Server-Side RBAC & Enterprise Security Checks
    const resolvedActionName = matchedTool.actionName;
    const providerName = parentIntegration.provider;
    const dbRiskLevel = matchedTool.riskLevel || "READ_ONLY";
    const evaluatedRisk = evaluateActionRisk(resolvedActionName);
    
    // Server risk is the higher of DB risk level or evaluated risk
    const serverRiskLevel = (dbRiskLevel === "HIGH_RISK_WRITE" || dbRiskLevel === "IRREVERSIBLE" || evaluatedRisk === "HIGH" || evaluatedRisk === "CRITICAL")
      ? (dbRiskLevel === "IRREVERSIBLE" || evaluatedRisk === "CRITICAL" ? "IRREVERSIBLE" : "HIGH_RISK_WRITE")
      : dbRiskLevel;

    // 4.1 Authoritative Input Schema Validation (must precede confirmation gate)
    let providerImpl;
    try {
      providerImpl = providerRegistry.getProvider(providerName);
    } catch (e: any) {
      return {
        success: false,
        status: "EXECUTION_FAILED",
        error: e.message || `Provider ${providerName} execution engine is not registered.`
      };
    }

    const toolDef = providerImpl?.getAvailableTools()?.find(t => t.actionName === resolvedActionName);
    const schemaToValidate = toolDef?.inputSchema || matchedTool.inputSchema;
    const valResult = validateToolSchema(schemaToValidate, input);
    if (!valResult.valid) {
      return {
        success: false,
        status: "INVALID_INPUT",
        error: `Input validation failed for tool '${resolvedActionName}': ${valResult.error}`,
        toolExecuted: resolvedActionName,
        provider: providerName,
        riskLevel: serverRiskLevel
      };
    }

    // Check RBAC permissions from websitePermissions table
    const permissions = await db
      .select()
      .from(websitePermissions)
      .where(eq(websitePermissions.projectId, projectId));

    let rbacRequireConfirmation = false;
    if (permissions.length > 0) {
      const policy = permissions[0];
      const rbac = policy.rbacRules as any;
      if (serverRiskLevel !== "READ_ONLY") {
        if (rbac?.allowDestructiveActions === false) {
          return {
            success: false,
            status: "FORBIDDEN",
            error: "Write/destructive business actions are disabled by enterprise security policy."
          };
        }
        if (rbac?.requireHumanConfirmation) {
          rbacRequireConfirmation = true;
        }
      }
    }

    // 5. Authoritative Risk & Confirmation Enforcement
    const needsConfirmation =
      serverRiskLevel === "HIGH_RISK_WRITE" ||
      serverRiskLevel === "IRREVERSIBLE" ||
      requiresConfirmation(resolvedActionName) ||
      rbacRequireConfirmation;

    if (needsConfirmation) {
      if (confirmationToken) {
        const isValidToken = await verifyActionConfirmationToken(confirmationToken, {
          userId,
          projectId,
          sessionId: sessionId,
          actionId: matchedTool.id,
          actionType: resolvedActionName,
          actionTarget: providerName
        });

        if (!isValidToken) {
          return {
            success: false,
            status: "INVALID_CONFIRMATION_TOKEN",
            error: "Action confirmation token is invalid, expired, or mismatched."
          };
        }
      } else {
        // Generate cryptographic confirmation token
        const { token, expiresAt } = generateActionConfirmationToken({
          userId,
          projectId,
          sessionId,
          actionId: matchedTool.id,
          actionType: resolvedActionName,
          actionTarget: providerName
        });

        return {
          success: true,
          status: "PENDING_CONFIRMATION",
          requiresConfirmation: true,
          actionId: matchedTool.id,
          confirmationToken: token,
          expiresAt,
          riskLevel: serverRiskLevel,
          toolExecuted: resolvedActionName,
          provider: providerName,
          error: `Confirmation required: "${resolvedActionName}" is classified as ${serverRiskLevel} risk.`
        };
      }
    }

    // 6. Quota Check & Increment
    const quotaCheck = await checkAndIncrementUsage(projectId, "action", 1, isSuperAdmin);
    if (!quotaCheck.allowed) {
      return {
        success: false,
        status: "QUOTA_EXCEEDED",
        error: quotaCheck.reason || "Monthly action execution quota exceeded."
      };
    }

    // 7. Decrypt Credentials & Provider Execution
    let credentialsObj: any = {};
    try {
      credentialsObj = JSON.parse(crypto.decrypt(parentIntegration.encryptedCredentials));
    } catch (e: any) {
      return {
        success: false,
        status: "EXECUTION_FAILED",
        error: "Failed to decrypt integration credentials."
      };
    }

    // 7.5 Authoritative Server-Side Customer Identity & Parameter Scoping
    // Derive isBusinessAdmin strictly from trusted server-side database role checks.
    // Never infer admin privileges from userId existence, orgId, or untrusted LLM input.

    const isCustomerSession = customerContext && customerContext.isBusinessAdmin === false;
    if (!isBusinessAdmin || isCustomerSession) {
      const verifiedEmail = customerContext?.email;
      const verifiedCustId = customerContext?.customerId;
      const verifiedPhone = customerContext?.phone;
      const isVerified = customerContext?.verified === true;

      // Extract parameters supplied in LLM/user input
      const inputCustomerId = input?.customerId;
      const inputEmail = input?.customerEmail || input?.email;

      // Fail-closed: If input supplies a customer identifier that contradicts the verified context, block execution
      if (inputCustomerId && verifiedCustId && String(inputCustomerId) !== String(verifiedCustId)) {
        return {
          success: false,
          status: "FORBIDDEN",
          error: "Access denied: Customer IDOR violation. Cannot access records belonging to another customer."
        };
      }
      if (inputEmail && verifiedEmail && String(inputEmail).toLowerCase() !== String(verifiedEmail).toLowerCase()) {
        return {
          success: false,
          status: "FORBIDDEN",
          error: "Access denied: Customer IDOR violation. Cannot access records belonging to another customer."
        };
      }

      // Attach authoritative customerScope object to input for provider execution
      input.customerScope = {
        isCustomerScoped: true,
        verified: isVerified,
        email: verifiedEmail,
        customerId: verifiedCustId,
        phone: verifiedPhone
      };
    }

    let executionResult: any = null;
    let executionError: string | null = null;

    // 7.7 Tool Execution with Bounded Timeout and Transient Retry
    const isReadOnly = serverRiskLevel === "READ_ONLY";
    const maxAttempts = isReadOnly ? 3 : 1;
    let attempt = 0;

    const executeWithTimeout = async () => {
      let timer: any;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Tool execution timed out after ${timeoutMs}ms.`)), timeoutMs);
      });
      try {
        return await Promise.race([
          providerImpl.executeTool(resolvedActionName, input, credentialsObj),
          timeoutPromise
        ]);
      } finally {
        clearTimeout(timer);
      }
    };

    while (attempt < maxAttempts) {
      attempt++;
      try {
        executionResult = await executeWithTimeout();
        executionError = null;
        break;
      } catch (execErr: any) {
        executionError = execErr.message || "Provider tool execution failed.";
        const isTransient = /timeout|econnreset|etimedout|socket hang up|503|429|resource_exhausted/i.test(executionError || "");
        if (isReadOnly && isTransient && attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, Math.min(400 * Math.pow(2, attempt), 2000)));
          continue;
        }
        break;
      }
    }

    if (executionError) {
      await refundUsage(projectId, "action", 1);
    }

    // 7.8 Tool Result Sanitization - strip credentials/secrets, enforce size limits
    if (executionResult) {
      try {
        const resultStr = JSON.stringify(executionResult);
        const MAX_RESULT_SIZE = 50000; // 50KB max
        if (resultStr.length > MAX_RESULT_SIZE) {
          executionResult = { _truncated: true, _originalSize: resultStr.length, data: JSON.parse(resultStr.slice(0, MAX_RESULT_SIZE)) };
        }
        // Deep-strip sensitive fields from provider results
        const sensitiveKeys = ['accessToken', 'access_token', 'api_key', 'apiKey', 'secret', 'password', 'credential', 'private_key', 'refresh_token', 'session_token'];
        const stripSensitive = (obj: any): any => {
          if (!obj || typeof obj !== 'object') return obj;
          if (Array.isArray(obj)) return obj.map(stripSensitive);
          const cleaned: any = {};
          for (const [k, v] of Object.entries(obj)) {
            if (sensitiveKeys.some(sk => k.toLowerCase().includes(sk.toLowerCase()))) {
              cleaned[k] = '[REDACTED]';
            } else {
              cleaned[k] = stripSensitive(v);
            }
          }
          return cleaned;
        };
        executionResult = stripSensitive(executionResult);
      } catch (sanitizeErr) {
        logger.warn({ sanitizeErr }, "Failed to sanitize tool execution result");
      }
    }

    // 8. Output Verification Engine
    const verRes = await verificationAgent.execute({
      projectId,
      sessionId,
      payload: {
        result: {
          toolExecuted: resolvedActionName,
          status: executionError ? "failed" : "success",
          error: executionError,
          data: executionResult
        }
      }
    });

    const isVerified = verRes.data?.verified === true && !executionError;

    // 9. Enterprise Audit Logging & Live Activity Emission
    try {
      const [insertedAudit] = await db.insert(enterpriseAuditLogs).values({
        projectId,
        actionType: isVerified ? "TOOL_EXECUTION_SUCCESS" : "TOOL_EXECUTION_FAILED",
        details: {
          requestId: executionId || randomUUID(),
          organizationId: effectiveOrgId,
          durationMs: Date.now() - executionStart,
          toolId: matchedTool.id,
          actionName: resolvedActionName,
          providerName,
          userId,
          status: isVerified ? "SUCCESS" : "FAILED",
          riskLevel: serverRiskLevel,
          error: executionError || verRes.data?.reason || null
        }
      }).returning();

      if (insertedAudit) {
        emitActivityEvent({
          id: `audit-${insertedAudit.id}`,
          type: "tool_execution",
          title: `Tool Executed: ${resolvedActionName}`,
          detail: `Provider: ${providerName} • Status: ${isVerified ? "SUCCESS" : "FAILED"}`,
          status: isVerified ? "SUCCESS" : "FAILED",
          timestamp: insertedAudit.timestamp,
          projectId,
          metadata: {
            durationMs: Date.now() - executionStart,
            riskLevel: serverRiskLevel,
            status: isVerified ? "SUCCESS" : "FAILED"
          }
        });

        // Trigger smart notification if tool execution failed
        if (!isVerified) {
          createNotification({
            projectId,
            type: "TOOL_FAILED",
            severity: "error",
            title: `Tool Failed: ${resolvedActionName}`,
            message: `Tool execution on provider ${providerName} failed. ${executionError || verRes.data?.reason || "Verification failed"}`,
            referenceId: insertedAudit.id,
            dedupeKey: `tool_fail_${insertedAudit.id}`,
          }).catch(() => {});
        } else if (serverRiskLevel === "HIGH" || serverRiskLevel === "CRITICAL") {
          createNotification({
            projectId,
            type: "SECURITY_ALERT",
            severity: "warning",
            title: `High Risk Tool Action: ${resolvedActionName}`,
            message: `Action executed on provider ${providerName} with ${serverRiskLevel} risk level.`,
            referenceId: insertedAudit.id,
            dedupeKey: `tool_sec_${insertedAudit.id}`,
          }).catch(() => {});
        }
      }
    } catch (auditErr) {
      logger.error({ auditErr }, "Failed to write audit log entry");
    }

    if (!isVerified) {
      return {
        success: false,
        status: "EXECUTION_FAILED",
        error: executionError || verRes.data?.reason || "Execution verification failed.",
        toolExecuted: resolvedActionName,
        provider: providerName,
        verification: verRes.data
      };
    }

    const completedResult: ExecuteServerToolResult = {
      success: true,
      status: "COMPLETED",
      data: executionResult,
      toolExecuted: resolvedActionName,
      provider: providerName,
      riskLevel: serverRiskLevel,
      verification: verRes.data
    };

    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, { result: completedResult, timestamp: Date.now() });
    }

    return completedResult;
  } catch (err: any) {
    logger.error({ err, projectId, toolId, actionName }, "executeServerTool unhandled error");
    return {
      success: false,
      status: "EXECUTION_FAILED",
      error: err.message || "Internal server error during tool execution."
    };
  }
}
