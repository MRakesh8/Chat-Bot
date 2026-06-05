import { GoogleGenAI } from "@google/genai";

if (!process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
  throw new Error(
    "AI_INTEGRATIONS_GEMINI_BASE_URL must be set. Did you forget to provision the Gemini AI integration?",
  );
}

const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

// Load all available API keys from environment variables
const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY // keep original as fallback
].filter(Boolean) as string[];

if (API_KEYS.length === 0) {
  console.warn("No GEMINI_API_KEY_* or AI_INTEGRATIONS_GEMINI_API_KEY set. Using fallback free key.");
  API_KEYS.push("YOUR_FREE_GEMINI_API_KEY");
}

// Global state for round-robin rotation
let currentKeyIndex = 0;

// Create client instances for each key
const clients = API_KEYS.map(key => new GoogleGenAI({
  apiKey: key,
  httpOptions: {
    apiVersion: "",
    baseUrl: baseUrl,
  },
}));

// Models for fallback
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-3-flash"];

// Helper to determine if an error is a 429
const isRateLimitError = (err: any) => {
  const status = err?.status || err?.response?.status;
  return status === 429 || err?.message?.includes("429");
};

class GeminiFailoverModels {
  async generateContent(options: any) {
    return this._executeWithFailover('generateContent', options);
  }

  async generateContentStream(options: any) {
    return this._executeWithFailover('generateContentStream', options);
  }

  async embedContent(options: any) {
    // Embeddings just rotate keys, no model fallback
    return this._executeKeyRotationOnly('embedContent', options);
  }

  private async _executeWithFailover(method: 'generateContent' | 'generateContentStream', options: any) {
    const originalModel = options.model || "gemini-2.5-flash";
    const modelsToTry = FALLBACK_MODELS.includes(originalModel) ? FALLBACK_MODELS : [originalModel];
    
    // We will iterate across all keys, and for each key, across all models
    // Max attempts = number of keys * number of models
    let attemptCount = 0;
    const maxAttempts = clients.length * modelsToTry.length;

    while (attemptCount < maxAttempts) {
      // Calculate current key and model
      const keyIndex = (currentKeyIndex + Math.floor(attemptCount / modelsToTry.length)) % clients.length;
      const modelIndex = attemptCount % modelsToTry.length;
      const modelToUse = modelsToTry[modelIndex];

      const client = clients[keyIndex];
      const attemptOptions = { ...options, model: modelToUse };

      try {
        console.log(`[Gemini] Attempt ${attemptCount + 1}/${maxAttempts} - Key Index: ${keyIndex}, Model: ${modelToUse}`);
        const result = await (client.models[method] as any)(attemptOptions);
        
        // If successful, advance the global round-robin index for the NEXT request
        if (attemptCount === 0) {
           // Advance globally only on first attempt success to maintain round robin
           currentKeyIndex = (currentKeyIndex + 1) % clients.length;
        } else {
           // If we fell back, start next request from the next working key
           currentKeyIndex = (keyIndex + 1) % clients.length;
        }

        console.log(`[Gemini] Success on Attempt ${attemptCount + 1}`);
        return result;
      } catch (err: any) {
        if (isRateLimitError(err)) {
          console.warn(`[Gemini] Rate limit hit on Attempt ${attemptCount + 1} (Key ${keyIndex}, Model ${modelToUse})`);
          attemptCount++;
        } else {
          // If it's not a rate limit error (e.g. bad request, parsing error), throw immediately
          console.error(`[Gemini] Non-429 error on Attempt ${attemptCount + 1}:`, err.message);
          throw err;
        }
      }
    }

    console.error("[Gemini] All keys and fallback models exhausted due to rate limits.");
    // Throw an explicit error object with status 429 so route handlers can catch it
    throw { status: 429, message: "AI service is busy. Please try again in a few moments." };
  }

  private async _executeKeyRotationOnly(method: 'embedContent', options: any) {
    let attemptCount = 0;
    const maxAttempts = clients.length;

    while (attemptCount < maxAttempts) {
      const keyIndex = (currentKeyIndex + attemptCount) % clients.length;
      const client = clients[keyIndex];

      try {
        console.log(`[Gemini Embedding] Attempt ${attemptCount + 1}/${maxAttempts} - Key Index: ${keyIndex}`);
        const result = await (client.models[method] as any)(options);
        
        if (attemptCount === 0) {
           currentKeyIndex = (currentKeyIndex + 1) % clients.length;
        } else {
           currentKeyIndex = (keyIndex + 1) % clients.length;
        }

        return result;
      } catch (err: any) {
        if (isRateLimitError(err)) {
          console.warn(`[Gemini Embedding] Rate limit hit on Attempt ${attemptCount + 1} (Key ${keyIndex})`);
          attemptCount++;
        } else {
          throw err;
        }
      }
    }

    console.error("[Gemini Embedding] All keys exhausted due to rate limits.");
    throw { status: 429, message: "AI service is busy. Please try again in a few moments." };
  }
}

export const ai = {
  models: new GeminiFailoverModels()
};
