import { GoogleGenAI } from "@google/genai";
import { db, userApiKeys, userApiSettings, crypto } from "@workspace/db";
import { eq, and, isNull, asc } from "drizzle-orm";

if (!process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
  throw new Error(
    "AI_INTEGRATIONS_GEMINI_BASE_URL must be set. Did you forget to provision the Gemini AI integration?",
  );
}

const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

// Models for fallback
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableError = (err: any): boolean => {
  if (!err) return false;
  const status = err?.status || err?.response?.status || err?.code;
  if (status === 429 || status === 503 || status === 502 || status === 504 || status === 500 || status === 408) {
    return true;
  }
  const statusStr = String(err?.status || err?.response?.status || err?.code || "").toUpperCase();
  if (statusStr === "UNAVAILABLE" || statusStr === "RESOURCE_EXHAUSTED" || statusStr === "INTERNAL") {
    return true;
  }
  const errMessage = String(err?.message || err?.stack || err).toLowerCase();
  const retryableKeywords = [
    "429", "503", "500", "502", "504",
    "unavailable", "resource_exhausted", "quota", "timeout", "deadline exceeded",
    "rate limit", "overloaded", "too many requests", "service unavailable", "internal server error",
    "spikes in demand", "experiencing high demand", "try again later"
  ];
  return retryableKeywords.some(keyword => errMessage.includes(keyword));
};

async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 500
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const isRetryable = isRetryableError(err);
      if (isRetryable && attempt <= maxRetries) {
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[LLM Retry] Attempt ${attempt} failed with retryable error: ${err.message || err}. Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
}

import type { GenerateContentResponse, EmbedContentResponse } from "@google/genai";

class GeminiFailoverModels {
  async generateContent(userId: string | null, options: any): Promise<GenerateContentResponse> {
    return this._executeWithRouting(userId, 'generateContent', options) as Promise<GenerateContentResponse>;
  }

  async generateContentStream(userId: string | null, options: any): Promise<AsyncGenerator<GenerateContentResponse, any, any>> {
    return this._executeWithRouting(userId, 'generateContentStream', options) as Promise<AsyncGenerator<GenerateContentResponse, any, any>>;
  }

  async embedContent(userId: string | null, options: any): Promise<EmbedContentResponse> {
    return this._executeWithRouting(userId, 'embedContent', options) as Promise<EmbedContentResponse>;
  }

  private async _fetchAndResetKeys(userId: string | null) {
    // 1. Fetch Mode
    let mode = "auto";
    if (userId) {
      const settings = await db.select().from(userApiSettings).where(eq(userApiSettings.userId, userId));
      if (settings.length > 0) mode = settings[0].apiMode;
    }

    // 2. Fetch Keys
    let userKeys: any[] = [];
    if (userId) {
       userKeys = await db.select().from(userApiKeys).where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.isEnabled, true)));
    }
    let systemKeys = await db.select().from(userApiKeys).where(and(isNull(userApiKeys.userId), eq(userApiKeys.isEnabled, true)));
    
    // Auto-provision system keys from environment if not already in the database
    const envSystemKeys = Array.from(new Set([
      process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_1,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
      process.env.GEMINI_API_KEY
    ].filter(Boolean) as string[]));

    if (envSystemKeys.length > 0) {
      let allSystemKeys = await db.select().from(userApiKeys).where(isNull(userApiKeys.userId));
      const decryptedAllSystemKeys = allSystemKeys.map(k => {
        try {
          return crypto.decrypt(k.encryptedKey) || k.encryptedKey;
        } catch {
          return k.encryptedKey;
        }
      });

      const keysToInsert = envSystemKeys.filter(envKey => !decryptedAllSystemKeys.includes(envKey));

      if (keysToInsert.length > 0) {
        for (let i = 0; i < keysToInsert.length; i++) {
          const key = keysToInsert[i];
          try {
            const encryptedKey = crypto.encrypt(key);
            const maskedKey = key.substring(0, 4) + "..." + key.slice(-4);
            
            const [newKey] = await db.insert(userApiKeys).values({
              name: `System Key ${allSystemKeys.length + 1} (Auto-Provisioned)`,
              provider: "gemini",
              encryptedKey: encryptedKey,
              maskedKey: maskedKey,
              isPrimary: allSystemKeys.length === 0 && i === 0,
              isEnabled: true,
              isSystem: true,
              status: "HEALTHY",
              dailyLimit: null
            }).returning();
            
            systemKeys.push(newKey);
            allSystemKeys.push(newKey);
            console.log(`[Gemini Routing] Auto-provisioned system key from environment.`);
          } catch (insertErr) {
            console.error("[Gemini Routing] Failed to auto-provision system key:", insertErr);
          }
        }
      }
    }

    let keys = [...userKeys, ...systemKeys];

    // 3. Reset logic
    const now = new Date();
    for (const key of keys) {
       // Reset if it's a new day (simple UTC check for now)
       if (
         key.lastResetAt.getUTCDate() !== now.getUTCDate() ||
         key.lastResetAt.getUTCMonth() !== now.getUTCMonth() ||
         key.lastResetAt.getUTCFullYear() !== now.getUTCFullYear()
       ) {
         await db.update(userApiKeys).set({
           dailyUsed: 0,
           status: "HEALTHY",
           cooldownUntil: null,
           lastResetAt: now,
           failureReason: null
         }).where(eq(userApiKeys.id, key.id));
         key.dailyUsed = 0;
         key.status = "HEALTHY";
         key.cooldownUntil = null;
         key.lastResetAt = now;
         key.failureReason = null;
       } else if (
         (key.status === "COOLDOWN" || key.status === "QUOTA_EXCEEDED" || key.status === "UNHEALTHY") &&
         key.cooldownUntil &&
         now > key.cooldownUntil
       ) {
         await db.update(userApiKeys).set({ status: "HEALTHY", cooldownUntil: null, failureReason: null }).where(eq(userApiKeys.id, key.id));
         key.status = "HEALTHY";
         key.cooldownUntil = null;
         key.failureReason = null;
       }
    }

    // Filter available
    let availableKeys = keys.filter(k => k.status === "HEALTHY");

    // Fallback: If no fully HEALTHY keys are available, fall back to trying all enabled keys
    // that are not explicitly marked as INVALID (which means they have a physical bad key / 403 error).
    // This allows temporary/cooldown/quota keys to self-heal and be retried, avoiding full outages.
    if (availableKeys.length === 0) {
      console.warn("[Gemini Routing] No HEALTHY keys available. Falling back to trying all enabled keys in cooldown/quota status.");
      availableKeys = keys.filter(k => k.isEnabled && k.status !== "INVALID");
    }

    // 4. Sort based on mode and primary status
    availableKeys.sort((a, b) => {
      // Primary keys first
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      
      if (mode === "auto" || mode === "user_first") {
        return (a.isSystem === b.isSystem ? 0 : a.isSystem ? 1 : -1);
      } else if (mode === "system_first") {
        return (a.isSystem === b.isSystem ? 0 : a.isSystem ? -1 : 1);
      }
      return 0;
    });

    return availableKeys;
  }

  private _checkIsDailyLimit(error: any): boolean {
    if (!error) return false;
    const parts: string[] = [];
    if (error.message) parts.push(String(error.message));
    if (error.stack) parts.push(String(error.stack));
    if (typeof error === 'string') parts.push(error);
    try {
      if (error.response) {
        parts.push(typeof error.response === 'string' ? error.response : JSON.stringify(error.response));
      }
      if (error.details) {
        parts.push(typeof error.details === 'string' ? error.details : JSON.stringify(error.details));
      }
      parts.push(JSON.stringify(error));
    } catch (e) {}
    
    const fullErrorText = parts.join(" ").toLowerCase();
    const hasQuotaExceeded = fullErrorText.includes("quota exceeded") || fullErrorText.includes("quota_exceeded") || fullErrorText.includes("exceeded your current quota");
    const isDailyOrFreeLimit = 
      fullErrorText.includes("generaterequestsperday") || 
      fullErrorText.includes("requestsperday") || 
      fullErrorText.includes("daily") || 
      (fullErrorText.includes("free_tier") && fullErrorText.includes("limit: 0")) ||
      (fullErrorText.includes("free-tier") && fullErrorText.includes("limit: 0")) ||
      fullErrorText.includes("check your plan and billing details");
      
    return hasQuotaExceeded && isDailyOrFreeLimit;
  }

  private _calculateCooldown(error: any): number {
    if (this._checkIsDailyLimit(error)) {
      return 720; // 12 hours
    }
    
    const errText = String(error?.message || error).toLowerCase();
    
    // Try to parse retry delay from error message (e.g. "Please retry in 57.061310034s.")
    const match = errText.match(/retry\s+in\s+(\d+(?:\.\d+)?)s/i);
    if (match) {
      const seconds = parseFloat(match[1]);
      return Math.max(1, Math.ceil(seconds / 60));
    }
    
    // Check retry-after header if present (commonly returned by proxies/gateways)
    const retryAfterHeader = error?.response?.headers?.get?.('retry-after');
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(seconds)) {
        // Cap RPM rate limit cooldown at 2 minutes to prevent starving the key rotation pool
        return Math.min(2, Math.max(1, Math.ceil(seconds / 60)));
      }
    }
    
    return 1; // default 1 minute for other 429 rate limits
  }

  private async _updateKeyFailure(key: any, error: any) {
    const now = new Date();
    
    const errMessage = error?.message || String(error);
    const statusStr = error?.status || error?.response?.status || error?.code || 'unknown';
    const errStr = errMessage.toLowerCase();
    
    let cooldownMinutes = 0;
    let status = "COOLDOWN";
    let isEnabled = key.isEnabled;
    
    const is403 = statusStr === '403' || statusStr === 403 || errStr.includes('403') || errStr.includes('permission denied') || errStr.includes('api key not valid');
    const isTimeout = errStr.includes('timeout') || errStr.includes('deadline exceeded');
    const is429 = statusStr === '429' || statusStr === 429 || errStr.includes('429') || errStr.includes('too many requests') || errStr.includes('resource_exhausted') || errStr.includes('quota');
    
    if (is403) {
      status = "INVALID";
      cooldownMinutes = 0;
      isEnabled = false;
    } else if (is429) {
      status = "QUOTA_EXCEEDED";
      cooldownMinutes = this._calculateCooldown(error);
    } else if (isTimeout) {
      status = "COOLDOWN";
      cooldownMinutes = 2;
    } else {
      status = "UNHEALTHY";
      cooldownMinutes = 5;
    }

    const cooldownUntil = cooldownMinutes > 0 ? new Date(now.getTime() + cooldownMinutes * 60000) : null;
    
    await db.update(userApiKeys).set({
      status,
      cooldownUntil,
      isEnabled,
      failureReason: errMessage,
      lastFailure: now,
      totalFailures: key.totalFailures + 1,
      totalRequests: key.totalRequests + 1,
    }).where(eq(userApiKeys.id, key.id));
  }

  private async _updateKeySuccess(key: any) {
    const now = new Date();
    const newUsed = key.dailyUsed + 1;
    let status = "HEALTHY";

    if (key.dailyLimit !== null && newUsed >= key.dailyLimit) {
      status = "QUOTA_EXCEEDED";
    }

    await db.update(userApiKeys).set({
      dailyUsed: newUsed,
      lastSuccess: now,
      totalRequests: key.totalRequests + 1,
      status,
      failureReason: null
    }).where(eq(userApiKeys.id, key.id));
  }

  private async _executeWithRouting(userId: string | null, method: 'generateContent' | 'generateContentStream' | 'embedContent', options: any) {
    const keys = await this._fetchAndResetKeys(userId);

    if (keys.length === 0) {
      throw { success: false, code: "NO_HEALTHY_KEYS", status: 503, message: "All AI API keys are unavailable. Please add a new API key or wait for quota reset." };
    }

    const originalModel = options.model || "gemini-2.5-flash";
    const modelsToTry = method === 'embedContent' ? [originalModel] : Array.from(new Set([originalModel, ...FALLBACK_MODELS]));
    
    let lastError: any = null;

    for (const key of keys) {
      const decryptedKey = crypto.decrypt(key.encryptedKey);
      
      const client = new GoogleGenAI({
        apiKey: decryptedKey || key.encryptedKey, // Fallback in case it's not encrypted correctly during migration
        httpOptions: { apiVersion: "", baseUrl: baseUrl }
      });

      let keyFailed = false;
      let allFailuresWereTransient = true;

      for (const modelToUse of modelsToTry) {
        const attemptOptions = { ...options, model: modelToUse };
        
        try {
          console.log(`[Gemini Routing] Provider: ${key.provider} | Model: ${modelToUse} | Key: ${key.id} (System: ${key.isSystem}) | Status: Trying`);
          
          let result;
          if (method === 'generateContent') {
            result = await executeWithRetry(() => client.models.generateContent(attemptOptions));
          } else if (method === 'generateContentStream') {
            result = await executeWithRetry(() => client.models.generateContentStream(attemptOptions));
          } else if (method === 'embedContent') {
            result = await executeWithRetry(() => client.models.embedContent(attemptOptions as any));
          }

          await this._updateKeySuccess(key);
          return result;
        } catch (err: any) {
          lastError = err;
          const status = err?.status || err?.response?.status || 'unknown';
          const isTimeout = err?.message?.toLowerCase().includes("timeout");
          const keySlot = key.isSystem ? `System API ${key.id.substring(0,4)}` : `User API ${key.id.substring(0,4)}`;
          
          const logOutput = `Provider: ${key.provider}\nModel: ${modelToUse}\nKey Slot: ${keySlot}\nHTTP Status: ${status}\nError: ${err.message}\n----------------------------------------`;
          
          const is5xx = status === 503 || status === 500 || status === 502 || status === 504 ||
                        err?.message?.includes("503") || err?.message?.includes("500") ||
                        err?.message?.includes("502") || err?.message?.includes("504");

          if (!is5xx) {
            allFailuresWereTransient = false;
          }

          if (status === 429) {
            console.warn(`[Gemini Routing] Rate Limit:\n${logOutput}`);
            await this._updateKeyFailure(key, err);
            keyFailed = true;
            break; // Move to next key
          } else if (status === 403) {
            console.error(`[Gemini Routing] Permission Denied:\n${logOutput}`);
            await this._updateKeyFailure(key, err);
            keyFailed = true;
            break; // Move to next key
          } else if (isTimeout) {
            console.warn(`[Gemini Routing] Timeout:\n${logOutput}`);
            await this._updateKeyFailure(key, err);
            keyFailed = true;
            break; // Move to next key
          } else if (
            status === 503 || status === 404 || status === 500 || status === 502 || status === 504 ||
            err?.message?.includes("503") || err?.message?.includes("404") ||
            err?.message?.includes("500") || err?.message?.includes("502") || err?.message?.includes("504")
          ) {
            console.warn(`[Gemini Routing] Model/Server Error (Status ${status}): Trying fallback model...\n${logOutput}`);
            continue; // Try next fallback model for the SAME key
          } else if (isRetryableError(err)) {
            console.warn(`[Gemini Routing] Retryable Error:\n${logOutput}`);
            await this._updateKeyFailure(key, err);
            keyFailed = true;
            break; // Move to next key
          } else {
            console.error(`[Gemini Routing] Non-Retryable Error:\n${logOutput}`);
            throw err;
          }
        }
      }

      if (!keyFailed) {
        if (allFailuresWereTransient) {
          console.warn(`[Gemini Routing] Key ${key.id.substring(0,4)} failed all models due to transient server load/outage. Skipping database unhealthy lock.`);
        } else {
          await this._updateKeyFailure(key, new Error("All models failed to respond (including fallbacks)"));
        }
      }
    }

    console.error(`[Gemini Routing] All available keys failed or no keys available. Returning structured NO_HEALTHY_KEYS error. Last error:`, lastError?.message || lastError);
    
    const isLast5xx = lastError?.status === 503 || lastError?.status === 502 || lastError?.status === 504 ||
                      lastError?.message?.includes("503") || lastError?.message?.includes("502") || lastError?.message?.includes("504");
    const isLast429 = lastError?.status === 429 || lastError?.message?.includes("429");

    throw {
      success: false,
      code: isLast5xx ? "SERVICE_UNAVAILABLE" : (isLast429 ? "QUOTA_EXCEEDED" : "NO_HEALTHY_KEYS"),
      status: isLast5xx ? 503 : (isLast429 ? 429 : 503),
      message: isLast5xx 
        ? "AI service is currently experiencing high demand. Please try again in a few seconds." 
        : (isLast429 
            ? "AI service quota exceeded. Please wait for quota reset." 
            : "All AI API keys are unavailable. Please add a new API key or wait for quota reset.")
    };
  }
}

export const ai = {
  models: new GeminiFailoverModels()
};
