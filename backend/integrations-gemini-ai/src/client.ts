import { GoogleGenAI } from "@google/genai";

if (!process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
  throw new Error(
    "AI_INTEGRATIONS_GEMINI_BASE_URL must be set. Did you forget to provision the Gemini AI integration?",
  );
}

const GEMINI_API_KEY = process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "YOUR_FREE_GEMINI_API_KEY";
if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY) {
  console.warn("AI_INTEGRATIONS_GEMINI_API_KEY not set. Using fallback free key.");
}

export const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});
