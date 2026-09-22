import { db } from "@workspace/db";
import { projectApiKeys, userApiKeys, apiLogs } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { minuteCache } from "./cache-provider";

export type ApiStatus = "HEALTHY" | "RATE_LIMIT" | "TOKEN_LIMIT" | "DAILY_QUOTA" | "MONTHLY_CREDIT" | "INVALID_API_KEY" | "INVALID_MODEL" | "PROVIDER_DOWN" | "NETWORK_ERROR" | "DISABLED" | "UNHEALTHY" | "COOLDOWN" | "TIMEOUT";

interface UpdateKeyStatsParams {
  key: any;
  success: boolean;
  latencyMs: number;
  status: ApiStatus;
  error?: any;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  model: string;
}

export function classifyError(error: any): { status: ApiStatus; reason: string; cooldownMinutes: number } {
  const statusStr = String(error?.status || error?.response?.status || error?.code || 'unknown').toUpperCase();
  const errMessage = String(error?.message || error?.stack || error).toLowerCase();

  const is403 = statusStr === '403' || errMessage.includes('403') || errMessage.includes('permission denied') || errMessage.includes('api key not valid') || errMessage.includes('incorrect api key');
  const isTimeout = errMessage.includes('timeout') || errMessage.includes('deadline exceeded') || statusStr === '504' || statusStr === '408';
  const isProviderDown = statusStr === '500' || statusStr === '502' || statusStr === '503';
  const isInvalidModel = statusStr === '400' || statusStr === '404' || errMessage.includes('model_not_found') || errMessage.includes('does not exist') || errMessage.includes('invalid model');
  const isNetwork = errMessage.includes('econnreset') || errMessage.includes('etimedout') || errMessage.includes('network error') || errMessage.includes('fetch error');

  if (is403) return { status: "INVALID_API_KEY", reason: "Invalid or revoked API Key", cooldownMinutes: 0 };
  if (isInvalidModel) return { status: "INVALID_MODEL", reason: "Requested model does not exist or is not supported", cooldownMinutes: 0 };
  if (isProviderDown) return { status: "PROVIDER_DOWN", reason: `Provider returned ${statusStr}`, cooldownMinutes: 5 };
  if (isTimeout) return { status: "TIMEOUT" as ApiStatus, reason: "Request timed out", cooldownMinutes: 2 };
  if (isNetwork) return { status: "NETWORK_ERROR", reason: "Network connection error", cooldownMinutes: 2 };

  // Quota checks
  if (statusStr === '429' || errMessage.includes('too many requests') || errMessage.includes('quota') || errMessage.includes('resource_exhausted')) {
    if (errMessage.includes('daily') || errMessage.includes('generaterequestsperday') || errMessage.includes('free_tier') || errMessage.includes('limit: 0')) {
      return { status: "DAILY_QUOTA", reason: "Daily quota exhausted", cooldownMinutes: 1440 }; // 24 hours
    }
    if (errMessage.includes('billing') || errMessage.includes('credit')) {
      return { status: "MONTHLY_CREDIT", reason: "Monthly credit exhausted", cooldownMinutes: 43200 }; // 30 days
    }
    if (errMessage.includes('token')) {
      return { status: "TOKEN_LIMIT", reason: "Tokens per minute exceeded", cooldownMinutes: 1 };
    }
    
    // Parse retry-after from error
    let cooldown = 1;
    const match = errMessage.match(/retry\s+in\s+(\d+(?:\.\d+)?)s/i);
    if (match) {
      cooldown = Math.max(1, Math.ceil(parseFloat(match[1]) / 60));
    }
    return { status: "RATE_LIMIT", reason: "Requests per minute exceeded", cooldownMinutes: cooldown };
  }

  return { status: "UNHEALTHY", reason: error?.message || "Unknown error", cooldownMinutes: 5 };
}

export async function updateKeyStats(params: UpdateKeyStatsParams) {
  if (params.key.type === 'env') return; // Skip updating env vars

  const { key, success, latencyMs, status, error, promptTokens = 0, completionTokens = 0, totalTokens = 0, model } = params;
  const now = new Date();
  
  let failureReason = error ? String(error.message || error) : null;
  let cooldownUntil: Date | null = null;
  let finalStatus = status;

  if (!success && error) {
    const classified = classifyError(error);
    finalStatus = classified.status;
    failureReason = classified.reason;
    if (classified.cooldownMinutes > 0) {
      cooldownUntil = new Date(now.getTime() + classified.cooldownMinutes * 60000);
    }
  }

  // Calculate new health score
  const oldTotal = (key.rawDbKey?.totalRequests || 0);
  const oldFailures = (key.rawDbKey?.totalFailures || 0);
  const newTotal = oldTotal + 1;
  const newFailures = oldFailures + (success ? 0 : 1);
  const healthScore = Math.max(0, Math.floor(((newTotal - newFailures) / newTotal) * 100));

  // Compute moving average latency
  const oldLatency = key.rawDbKey?.latencyMs || 0;
  const newLatency = oldLatency === 0 ? latencyMs : Math.floor((oldLatency * 9 + latencyMs) / 10);

  const updateData: any = {
    status: finalStatus,
    healthScore,
    latencyMs: newLatency,
    lastUsed: now,
    totalRequests: newTotal,
    totalFailures: newFailures,
  };

  if (success) {
    updateData.lastSuccess = now;
    updateData.tokensToday = (key.rawDbKey?.tokensToday || 0) + totalTokens;
    updateData.cooldownUntil = null;
    updateData.failureReason = null;
  } else {
    updateData.lastFailure = now;
    updateData.failureReason = failureReason;
    if (cooldownUntil) updateData.cooldownUntil = cooldownUntil;
  }

  // Disable completely invalid keys
  if (finalStatus === "INVALID_API_KEY") {
    updateData.isEnabled = false;
  }

  try {
    if (key.type === 'project') {
      await db.update(projectApiKeys).set(updateData).where(eq(projectApiKeys.id, key.id!));
    } else {
      await db.update(userApiKeys).set(updateData).where(eq(userApiKeys.id, key.id!));
    }

    const { enqueueApiLog } = await import("../lib/queue");
    // Insert Log asynchronously
    await enqueueApiLog({
      keyId: key.id,
      userId: key.type === 'user' ? key.rawDbKey?.userId : null,
      projectId: key.type === 'project' ? key.rawDbKey?.projectId : null,
      provider: key.provider,
      model,
      latencyMs,
      success,
      failureReason,
      httpCode: error?.status || error?.response?.status || error?.code || null,
      promptTokens,
      completionTokens,
      totalTokens,
      cost: "0",
    });
  } catch (err) {
    console.error("[API Health] Failed to update key stats:", err);
  }
}
