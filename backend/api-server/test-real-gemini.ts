import { config } from "dotenv";
config({ path: "../../.env" });
import { UniversalProviderAdapter } from "./src/services/llm-provider";

async function run() {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      console.log("No API key found in .env");
      return;
    }
    const adapter = new UniversalProviderAdapter({
        provider: "gemini",
        apiKey,
        model: "gemini-2.0-flash",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || ""
    });

    console.log("Testing generateChat...");
    try {
        const response = await adapter.generateChat({
            messages: [{ role: "user", content: "Say hello!" }],
            maxTokens: 10
        });
        console.log("SUCCESS generateChat:", response.content);
    } catch(e: any) {
        console.log("FAILED generateChat:", e.message);
    }
}
run();
