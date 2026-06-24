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

const isRetryableError = (err: any) => {
  const status = err?.status || err?.response?.status;
  return status === 429 || status === 503 || status === 500 || status === 502 || status === 504 ||
         err?.message?.includes("429") || err?.message?.includes("503") ||
         err?.message?.includes("500") || err?.message?.includes("502") || err?.message?.includes("504") ||
         err?.message?.includes("timeout");
};

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

  private async _updateKeyFailure(key: any, errorType: 'timeout' | '429' | '403' | 'other', errMessage: string, retryAfter?: number) {
    const now = new Date();
    let cooldownMinutes = 0;
    let status = "COOLDOWN";
    let isEnabled = key.isEnabled;

    if (errorType === '403') {
      status = "INVALID";
      isEnabled = false;
    } else if (errorType === 'timeout') {
      cooldownMinutes = 2;
    } else if (errorType === '429') {
      status = "QUOTA_EXCEEDED";
      cooldownMinutes = retryAfter ? Math.ceil(retryAfter / 60) : 15;
    } else {
      cooldownMinutes = 1;
      status = "UNHEALTHY";
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
          if (method === 'generateContent') result = await client.models.generateContent(attemptOptions);
          else if (method === 'generateContentStream') result = await client.models.generateContentStream(attemptOptions);
          else if (method === 'embedContent') result = await client.models.embedContent(attemptOptions as any);

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
            const retryAfterHeader = err?.response?.headers?.get('retry-after');
            let retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

            // Check if it's a daily limit quota failure (e.g. Free Tier 20 requests/day limit)
            const errStr = String(err?.message || "").toLowerCase();
            const isDailyLimit = errStr.includes("quota exceeded") && 
                                 (errStr.includes("free_tier") || errStr.includes("limit: 20") || errStr.includes("day"));
            if (isDailyLimit) {
              // Bench this key for 12 hours so we do not repeatedly try it
              retryAfter = 12 * 60 * 60;
              console.warn(`[Gemini Routing] Key ${key.id.substring(0,4)} hit daily free tier quota limit. Cooldown set to 12 hours.`);
            }

            await this._updateKeyFailure(key, '429', err.message, retryAfter);
            keyFailed = true;
            break; // Move to next key
          } else if (status === 403) {
            console.error(`[Gemini Routing] Permission Denied:\n${logOutput}`);
            await this._updateKeyFailure(key, '403', err.message);
            keyFailed = true;
            break; // Move to next key
          } else if (isTimeout) {
            console.warn(`[Gemini Routing] Timeout:\n${logOutput}`);
            await this._updateKeyFailure(key, 'timeout', err.message);
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
            await this._updateKeyFailure(key, 'other', err.message);
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
          await this._updateKeyFailure(key, 'other', `All models failed to respond (including fallbacks)`);
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
