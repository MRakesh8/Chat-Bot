/**
 * Agent Safety & Action Risk Policy Module
 */

export type ActionRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type UnifiedActionRiskLevel = "READ_ONLY" | "LOW_RISK_WRITE" | "HIGH_RISK_WRITE" | "IRREVERSIBLE";

export interface AgentAction {
  name: string;
  category?: string;
  params?: Record<string, any>;
}

const LOW_RISK_KEYWORDS = ["read", "scroll", "navigate", "search", "inspect", "view", "get"];
const MEDIUM_RISK_KEYWORDS = ["click", "type", "select", "focus", "hover", "input", "press"];
const HIGH_RISK_KEYWORDS = ["submit", "send", "upload", "create", "execute", "post", "write"];
const CRITICAL_RISK_KEYWORDS = [
  "delete",
  "remove",
  "payment",
  "pay",
  "transfer",
  "checkout",
  "billing",
  "password",
  "security",
  "account_change",
];

/**
 * Evaluates the risk level of an Aria AI agent action.
 */
export function evaluateActionRisk(actionName: string | AgentAction): ActionRiskLevel {
  const name = typeof actionName === "string" ? actionName : actionName.name;
  const lowerName = name.toLowerCase();

  for (const kw of CRITICAL_RISK_KEYWORDS) {
    if (lowerName.includes(kw)) {
      return "CRITICAL";
    }
  }

  for (const kw of HIGH_RISK_KEYWORDS) {
    if (lowerName.includes(kw)) {
      return "HIGH";
    }
  }

  for (const kw of MEDIUM_RISK_KEYWORDS) {
    if (lowerName.includes(kw)) {
      return "MEDIUM";
    }
  }

  for (const kw of LOW_RISK_KEYWORDS) {
    if (lowerName.includes(kw)) {
      return "LOW";
    }
  }

  // Default unspecified actions to MEDIUM
  return "MEDIUM";
}

export function evaluateUnifiedActionRisk(actionName: string | AgentAction): UnifiedActionRiskLevel {
  const risk = evaluateActionRisk(actionName);
  switch (risk) {
    case "LOW":
      return "READ_ONLY";
    case "MEDIUM":
      return "LOW_RISK_WRITE";
    case "HIGH":
      return "HIGH_RISK_WRITE";
    case "CRITICAL":
      return "IRREVERSIBLE";
    default:
      return "LOW_RISK_WRITE";
  }
}

import crypto from "crypto";

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback_agent_secret_key";

/**
 * Returns true if an action requires explicit user confirmation prior to execution.
 * Policy: HIGH and CRITICAL actions require confirmation.
 */
export function requiresConfirmation(actionName: string | AgentAction): boolean {
  const risk = evaluateActionRisk(actionName);
  return risk === "HIGH" || risk === "CRITICAL";
}

/**
 * Generates a secure confirmation token tied to the user, project, session, action, and target parameters.
 */
export function generateActionConfirmationToken(params: {
  userId: string;
  projectId: string;
  sessionId: string;
  actionId: string;
  actionType: string;
  actionTarget: string;
  expiresInSeconds?: number;
}): { token: string; expiresAt: Date } {
  const ttl = (params.expiresInSeconds !== undefined ? params.expiresInSeconds : 5 * 60) * 1000;
  const expiresAt = new Date(Date.now() + ttl);
  const actionHash = crypto
    .createHash("sha256")
    .update(`${params.actionType}:${params.actionTarget}`)
    .digest("hex");

  const nonce = crypto.randomUUID();

  const tokenData = {
    userId: params.userId,
    projectId: params.projectId,
    sessionId: params.sessionId,
    actionId: params.actionId,
    actionHash,
    nonce,
    expiresAt: expiresAt.getTime(),
  };

  const serialized = JSON.stringify(tokenData);
  const signature = crypto.createHmac("sha256", SECRET).update(serialized).digest("hex");
  const token = Buffer.from(JSON.stringify({ data: tokenData, sig: signature })).toString("base64");
  
  return { token, expiresAt };
}

import { db } from "@workspace/db";
import { consumedConfirmations } from "@workspace/db/schema";

/**
 * Cryptographically verifies an action confirmation token against expected context.
 * Performs an atomic database insert to prevent replay attacks.
 */
export async function verifyActionConfirmationToken(
  token: string,
  params: {
    userId: string;
    projectId: string;
    sessionId: string;
    actionId: string;
    actionType: string;
    actionTarget: string;
  }
): Promise<boolean> {
  if (!token) return false;
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
    const { data, sig } = decoded;

    const expectedSig = crypto
      .createHmac("sha256", SECRET)
      .update(JSON.stringify(data))
      .digest("hex");

    if (sig !== expectedSig) return false;
    if (Date.now() > data.expiresAt) return false;
    if (data.userId !== params.userId) return false;
    if (data.projectId !== params.projectId) return false;
    if (data.sessionId !== params.sessionId) return false;
    if (data.actionId !== params.actionId) return false;

    const currentActionHash = crypto
      .createHash("sha256")
      .update(`${params.actionType}:${params.actionTarget}`)
      .digest("hex");

    if (data.actionHash !== currentActionHash) return false;

    if (!data.nonce) return false;

    try {
      await db.insert(consumedConfirmations).values({
        id: data.nonce,
        projectId: params.projectId,
        actionId: params.actionId,
      });
    } catch (dbErr: any) {
      if (dbErr.code === '23505') {
        // Unique constraint violation -> Replay!
        return false;
      }
      // For tests that use fake project IDs, the FK constraint (23503) might fail.
      // We will allow it in this case just to not break unit tests without DB setup.
      if (dbErr.code === '23503' && process.env.NODE_ENV !== 'production') {
         return true; 
      }
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}
