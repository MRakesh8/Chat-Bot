import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
import { GeminiAdapter } from "../services/ai-router/providers/gemini-adapter";

async function test() {
  const key = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
  const adapter = new GeminiAdapter();
  try {
    const models = await adapter.discoverModels(key, process.env.AI_INTEGRATIONS_GEMINI_BASE_URL);
    console.log(`Discovered ${models.length} models:`, models.map(m => m.modelId).slice(0, 10));
    
    for (const modelId of ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest']) {
      console.log(`\n--- Testing streaming with model: ${modelId} ---`);
      try {
        const stream = adapter.generateChatStream({
          model: {
            provider: "gemini",
            modelId,
            credential: { id: "test", apiKey: key, type: "system" }
          },
          messages: [{ role: "user", content: "Say hello in one word." }]
        });
        let streamText = "";
        for await (const chunk of stream) {
          process.stdout.write(chunk.text);
          streamText += chunk.text;
        }
        console.log(`\n[SUCCESS] Model ${modelId} streamed response: "${streamText.trim()}"`);
        break;
      } catch (err: any) {
        console.log(`[FAILED] Model ${modelId} error:`, err.message);
      }
    }
  } catch (err: any) {
    console.error("Test failed with error:", err);
  } finally {
    process.exit(0);
  }
}

test();
