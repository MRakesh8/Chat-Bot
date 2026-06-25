/**
 * @file intent-classifier.ts
 * @description Classifies a user's question into one of the supported intents 
 * to optimize prompt construction and reduce token bloat.
 */
import type { UserIntent } from "./types";
import { GoogleGenAI } from "@google/genai";

export class IntentClassifier {
  /**
   * Classifies the user's intent.
   * If the LLM call fails, defaults to "General Question" to ensure safe fallback.
   */
  async classify(params: {
    userMessage: string;
    apiKey: string;
  }): Promise<UserIntent> {
    try {
      const client = new GoogleGenAI({ apiKey: params.apiKey });

      const prompt = `Classify the following user message into exactly ONE of these intents. 
Respond with ONLY the exact intent name, nothing else.

INTENTS:
"Website Question" (Asking about the current page, layout, or general site info)
"Knowledge Question" (Asking "how to", policy questions, or general product queries)
"General Question" (Generic chat, chit-chat)
"Navigation Help" (Asking how to find a page or where to click)
"Dashboard Analysis" (Asking for metrics, numbers, KPIs, total clients, etc.)
"Form Assistance" (Asking for help filling out a form, errors, what a field means)
"Table Analysis" (Asking about table rows, invoices, lists, filtering)
"Greeting" (Hello, hi, good morning)
"Pricing" (Asking about costs, tiers, upgrades)
"Contact" (Asking to speak to a human, phone number, support)

User Message: "${params.userMessage}"

Intent:`;

      const response = await client.models.generateContent({
        model: "gemini-2.5-flash", // Using standard flash, fallback allowed
        contents: prompt,
        config: {
          temperature: 0.1,
          maxOutputTokens: 10,
        }
      });

      let intentText = (response.text?.trim() || "") as string;
      intentText = intentText.replace(/^["']|["']$/g, '');
      
      const validIntents: UserIntent[] = [
        "Website Question", "Knowledge Question", "General Question", 
        "Navigation Help", "Dashboard Analysis", "Form Assistance", 
        "Table Analysis", "Greeting", "Pricing", "Contact"
      ];

      if (validIntents.includes(intentText as UserIntent)) {
        return intentText as UserIntent;
      }
      
      return "General Question"; // Fallback
    } catch (err) {
      console.warn("Intent classification failed, falling back to General Question:", err);
      return "General Question";
    }
  }
}

export const intentClassifier = new IntentClassifier();
