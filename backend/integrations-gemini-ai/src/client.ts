import { GoogleGenAI } from "@google/genai";
import { db, apiKeys, userApiSettings } from "@workspace/db";
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
  return status === 429 || status === 404 || status === 503 || 
         err?.message?.includes("429") || err?.message?.includes("404") || err?.message?.includes("503") || err?.message?.includes("timeout");
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
       userKeys = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
    }
    const systemKeys = await db.select().from(apiKeys).where(isNull(apiKeys.userId));
    
    let keys = [...userKeys, ...systemKeys];

    // 3. Reset logic
    const now = new Date();
    for (const key of keys) {
       // Reset if it's a new day (simple UTC check for now)
       if (key.lastResetAt.getUTCDate() !== now.getUTCDate() || key.lastResetAt.getUTCMonth() !== now.getUTCMonth()) {
         await db.update(apiKeys).set({
           dailyUsed: 0,
           status: "healthy",
           cooldownUntil: null,
           lastResetAt: now
         }).where(eq(apiKeys.id, key.id));
         key.dailyUsed = 0;
         key.status = "healthy";
         key.cooldownUntil = null;
         key.lastResetAt = now;
       } else if (key.status === "cooldown" && key.cooldownUntil && now > key.cooldownUntil) {
         await db.update(apiKeys).set({ status: "healthy", cooldownUntil: null }).where(eq(apiKeys.id, key.id));
         key.status = "healthy";
         key.cooldownUntil = null;
       }
    }

    // Filter available
    let availableKeys = keys.filter(k => k.status === "healthy");

    // 4. Sort based on mode
    if (mode === "auto") {
      // Auto: User keys first, then System keys
      availableKeys.sort((a, b) => (a.isSystem === b.isSystem ? 0 : a.isSystem ? 1 : -1));
    } else if (mode === "user_first") {
      availableKeys.sort((a, b) => (a.isSystem === b.isSystem ? 0 : a.isSystem ? 1 : -1));
    } else if (mode === "system_first") {
      availableKeys.sort((a, b) => (a.isSystem === b.isSystem ? 0 : a.isSystem ? -1 : 1));
    }

    return availableKeys;
  }

  private async _updateKeyFailure(key: any, errorType: 'timeout' | '429' | 'other', errMessage: string) {
    const now = new Date();
    let cooldownMinutes = 0;
    let status = "cooldown";

    if (errorType === 'timeout') cooldownMinutes = 2;
    else if (errorType === '429') cooldownMinutes = 15;
    else {
      cooldownMinutes = 1;
    }

    const cooldownUntil = new Date(now.getTime() + cooldownMinutes * 60000);
    
    await db.update(apiKeys).set({
      status,
      cooldownUntil,
      lastError: errMessage,
    }).where(eq(apiKeys.id, key.id));
  }

  private async _updateKeySuccess(key: any) {
    const now = new Date();
    const newUsed = key.dailyUsed + 1;
    let status = "healthy";

    if (key.dailyLimit !== null && newUsed >= key.dailyLimit) {
      status = "exhausted";
    }

    await db.update(apiKeys).set({
      dailyUsed: newUsed,
      lastSuccess: now,
      status
    }).where(eq(apiKeys.id, key.id));
  }

  private async _executeWithRouting(userId: string | null, method: 'generateContent' | 'generateContentStream' | 'embedContent', options: any) {
    const keys = await this._fetchAndResetKeys(userId);

    if (keys.length === 0) {
      throw { status: 503, message: "AI service is currently unavailable. Please try again later or add your own API key." };
    }

    const originalModel = options.model || "gemini-2.5-flash";
    const modelsToTry = method === 'embedContent' ? [originalModel] : Array.from(new Set([originalModel, ...FALLBACK_MODELS]));
    
    for (const key of keys) {
      const client = new GoogleGenAI({
        apiKey: key.apiKey,
        httpOptions: { apiVersion: "", baseUrl: baseUrl }
      });

      for (const modelToUse of modelsToTry) {
        const attemptOptions = { ...options, model: modelToUse };
        
        try {
          console.log(`[Gemini Routing] Provider: Gemini | Model: ${modelToUse} | Key: ${key.id} (System: ${key.isSystem}) | Status: Trying`);
          
          let result;
          if (method === 'generateContent') result = await client.models.generateContent(attemptOptions);
          else if (method === 'generateContentStream') result = await client.models.generateContentStream(attemptOptions);
          else if (method === 'embedContent') result = await client.models.embedContent(attemptOptions as any);

          await this._updateKeySuccess(key);
          return result;
        } catch (err: any) {
          const status = err?.status || err?.response?.status || 'unknown';
          const isTimeout = err?.message?.toLowerCase().includes("timeout");
          const keySlot = key.isSystem ? `System API ${key.id.substring(0,4)}` : `User API ${key.id.substring(0,4)}`;
          
          const logOutput = `Provider: Gemini\nModel: ${modelToUse}\nKey Slot: ${keySlot}\nHTTP Status: ${status}\nError: ${err.message}\n----------------------------------------`;
          
          if (status === 429) {
            console.warn(`[Gemini Routing] Rate Limit:\n${logOutput}`);
            await this._updateKeyFailure(key, '429', err.message);
            break; // Move to next key
          } else if (isTimeout) {
            console.warn(`[Gemini Routing] Timeout:\n${logOutput}`);
            await this._updateKeyFailure(key, 'timeout', err.message);
            break; // Move to next key
          } else if (isRetryableError(err)) {
            console.warn(`[Gemini Routing] Retryable Error:\n${logOutput}`);
            await this._updateKeyFailure(key, 'other', err.message);
            break; // Move to next key
          } else {
            console.error(`[Gemini Routing] Non-Retryable Error:\n${logOutput}`);
            throw err;
          }
        }
      }
    }

    console.error(`[Gemini Routing] All available keys failed or no keys available. Returning 503.`);
    throw { status: 503, message: "AI service is currently unavailable. Please try again later or add your own API key." };
  }
}

export const ai = {
  models: new GeminiFailoverModels()
};
