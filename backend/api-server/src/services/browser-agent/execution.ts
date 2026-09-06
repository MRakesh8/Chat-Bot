import { db, projects, browserCapabilities, integrationTools, projectIntegrations, enterpriseAuditLogs, crypto } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { executeServerTool } from "../tool-execution";
import { checkProjectEntitlement } from "../../security/entitlement";
import { checkAndIncrementUsage } from "../../security/quota";
import { evaluateActionRisk, verifyActionConfirmationToken, generateActionConfirmationToken } from "../../security/agentSafety";
import { BrowserNavigationGuard } from "./guard";
import { BrowserSessionManager } from "./session";
import { logger } from "../../lib/logger";

export interface BrowserActionStep {
  type: "navigate" | "read" | "click" | "fill" | "wait" | "submit";
  targetUrl?: string;
  selector?: string;
  value?: string;
  ms?: number;
  expectedVerificationSelector?: string;
  expectedText?: string;
}

export interface ExecuteBrowserActionParams {
  projectId: string;
  orgId?: string;
  userId?: string;
  sessionId?: string;
  actionName: string;
  steps: BrowserActionStep[];
  confirmationToken?: string;
}

export interface ExecuteBrowserActionResult {
  success: boolean;
  status: "COMPLETED" | "PENDING_CONFIRMATION" | "EXECUTION_FAILED" | "FORBIDDEN" | "QUOTA_EXCEEDED" | "ENTITLEMENT_EXPIRED" | "INVALID_CONFIRMATION_TOKEN" | "ACTION_UNVERIFIED" | "DELEGATED_TO_API";
  data?: any;
  error?: string;
  confirmationToken?: string;
  riskLevel?: string;
  toolExecuted?: string;
  executionMode?: "API" | "BROWSER";
}

export async function executeApprovedBrowserAction(
  params: ExecuteBrowserActionParams
): Promise<ExecuteBrowserActionResult> {
  const {
    projectId,
    orgId,
    userId = "public_visitor",
    sessionId = "default_browser_session",
    actionName,
    steps = [],
    confirmationToken
  } = params;

  if (!projectId || !actionName) {
    return {
      success: false,
      status: "EXECUTION_FAILED",
      error: "Missing required projectId or actionName"
    };
  }

  // ─── RULE 1: API-FIRST ROUTING CHECK ───────────────────────────────────────
  // If an approved server-side API tool exists for this action, delegate to API tool!
  try {
    const apiTools = await db
      .select({
        toolId: integrationTools.id,
        status: integrationTools.status,
        integrationStatus: projectIntegrations.status
      })
      .from(integrationTools)
      .innerJoin(projectIntegrations, eq(integrationTools.integrationId, projectIntegrations.id))
      .where(and(
        eq(integrationTools.projectId, projectId),
        eq(integrationTools.actionName, actionName),
        eq(integrationTools.status, "EXECUTABLE"),
        eq(projectIntegrations.status, "AUTHORIZED")
      ))
      .limit(1);

    if (apiTools.length > 0) {
      logger.info({ projectId, actionName }, "[API_FIRST_ROUTING] Approved API tool found. Delegating execution to executeServerTool()");
      const apiExecRes = await executeServerTool({
        projectId,
        orgId,
        userId,
        sessionId,
        actionName,
        input: steps.length > 0 ? steps[0] : {}
      });

      return {
        ...apiExecRes,
        executionMode: "API"
      };
    }
  } catch (err: any) {
    logger.error({ err: err.message, projectId, actionName }, "[API_FIRST_ROUTING] Error checking API tools");
  }

  // ─── RULE 2: BROWSER CAPABILITY AUTHORIZATION ────────────────────────────
  const [capability] = await db
    .select()
    .from(browserCapabilities)
    .where(and(
      eq(browserCapabilities.projectId, projectId),
      eq(browserCapabilities.actionName, actionName)
    ))
    .limit(1);

  if (!capability || capability.status !== "EXECUTABLE" || !capability.isEnabled) {
    return {
      success: false,
      status: "FORBIDDEN",
      error: `Browser capability "${actionName}" is not authorized or not EXECUTABLE for this project. Status: ${capability?.status || "NOT_FOUND"}`
    };
  }

  // ─── RULE 3: ENTITLEMENT & QUOTA CHECK ─────────────────────────────────────
  const entitlement = await checkProjectEntitlement(projectId);
  if (!entitlement.allowed) {
    return {
      success: false,
      status: "ENTITLEMENT_EXPIRED",
      error: entitlement.message || "Project entitlement expired."
    };
  }

  const quota = await checkAndIncrementUsage(projectId, "action", 1);
  if (!quota.allowed) {
    return {
      success: false,
      status: "QUOTA_EXCEEDED",
      error: "Action monthly quota limit reached."
    };
  }

  // ─── RULE 4: RISK POLICY & STEP-UP CONFIRMATION ────────────────────────────
  const riskLevel = evaluateActionRisk(actionName);
  const effectiveRisk = capability.riskLevel || riskLevel;
  if (effectiveRisk === "HIGH_RISK_WRITE" || effectiveRisk === "IRREVERSIBLE" || effectiveRisk === "HIGH" || effectiveRisk === "CRITICAL") {
    const tokenPayload = {
      userId,
      projectId,
      sessionId,
      actionId: capability.id,
      actionType: actionName,
      actionTarget: "browser_ui"
    };

    if (!confirmationToken) {
      const { token, expiresAt } = generateActionConfirmationToken(tokenPayload);
      return {
        success: false,
        status: "PENDING_CONFIRMATION",
        riskLevel,
        toolExecuted: actionName,
        confirmationToken: token,
        error: `Action "${actionName}" requires explicit confirmation. Please verify and submit confirmation token.`
      };
    }

    const isValidToken = await verifyActionConfirmationToken(confirmationToken, tokenPayload);
    if (!isValidToken) {
      return {
        success: false,
        status: "INVALID_CONFIRMATION_TOKEN",
        error: "Action confirmation token is invalid, expired, or contextual metadata was tampered with."
      };
    }
  }

  // ─── RULE 5: BROWSER AUTOMATION EXECUTION ──────────────────────────────────
  const domainAllowlist: string[] = capability.domainAllowlist || [];
  let session = null;
  let readResults: any[] = [];
  let isVerified = false;

  try {
    session = await BrowserSessionManager.createIsolatedSession(projectId, sessionId);
    const { page } = session;

    BrowserNavigationGuard.attachToPage(page, domainAllowlist);

    for (const step of steps) {
      switch (step.type) {
        case "navigate": {
          if (!step.targetUrl) throw new Error("Step 'navigate' requires targetUrl.");
          const validatedUrl = await BrowserNavigationGuard.validateUrl(step.targetUrl, domainAllowlist);
          await page.goto(validatedUrl.toString(), { waitUntil: "networkidle2", timeout: 20000 });
          break;
        }
        case "click": {
          if (!step.selector) throw new Error("Step 'click' requires selector.");
          await page.waitForSelector(step.selector, { timeout: 10000 });
          await page.click(step.selector);
          break;
        }
        case "fill": {
          if (!step.selector || step.value === undefined) throw new Error("Step 'fill' requires selector and value.");
          await page.waitForSelector(step.selector, { timeout: 10000 });
          // Clear and fill
          await page.click(step.selector, { count: 3 });
          await page.type(step.selector, step.value);
          break;
        }
        case "wait": {
          if (step.selector) {
            await page.waitForSelector(step.selector, { timeout: step.ms || 10000 });
          } else {
            await new Promise(r => setTimeout(r, Math.min(step.ms || 1000, 5000)));
          }
          break;
        }
        case "read": {
          const selector = step.selector || "body";
          await page.waitForSelector(selector, { timeout: 10000 });
          const textContent = await page.$eval(selector, el => (el as any).innerText || (el as any).textContent || "");
          readResults.push({ selector, content: textContent.trim().substring(0, 2000) });
          break;
        }
        case "submit": {
          if (!step.selector) throw new Error("Step 'submit' requires selector.");
          await page.waitForSelector(step.selector, { timeout: 10000 });
          await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
            page.click(step.selector)
          ]);
          break;
        }
      }

      // Check Verification if specified in step
      if (step.expectedVerificationSelector) {
        const hasVerifiedEl = await page.$(step.expectedVerificationSelector);
        if (hasVerifiedEl) {
          if (step.expectedText) {
            const elText = await page.$eval(step.expectedVerificationSelector, el => (el as any).innerText || (el as any).textContent || "");
            isVerified = elText.toLowerCase().includes(step.expectedText.toLowerCase());
          } else {
            isVerified = true;
          }
        }
      } else {
        isVerified = true;
      }
    }

    // Record Audit Log
    try {
      await db.insert(enterpriseAuditLogs).values({
        projectId,
        actionType: "BROWSER_ACTION_EXECUTED",
        details: {
          actionName,
          riskLevel,
          stepsCount: steps.length,
          userId,
          verified: isVerified
        }
      });
    } catch (e) {}

    if (!isVerified) {
      return {
        success: false,
        status: "ACTION_UNVERIFIED",
        data: { readResults },
        riskLevel,
        toolExecuted: actionName,
        executionMode: "BROWSER",
        error: "Action completed but post-execution state verification failed."
      };
    }

    return {
      success: true,
      status: "COMPLETED",
      data: { readResults, verified: true },
      riskLevel,
      toolExecuted: actionName,
      executionMode: "BROWSER"
    };

  } catch (err: any) {
    logger.error({ err: err.message, projectId, actionName }, "[BROWSER_EXECUTION] Browser action execution failed");
    return {
      success: false,
      status: "EXECUTION_FAILED",
      riskLevel,
      toolExecuted: actionName,
      executionMode: "BROWSER",
      error: err.message || "Browser action execution failed."
    };
  } finally {
    if (session) {
      await session.close();
    }
  }
}
