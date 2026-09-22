import { config } from "dotenv";
config({ path: "../../.env" });
import { GeminiAdapter } from "./src/services/ai-router/providers/gemini-adapter";

async function run() {
    const adapter = new GeminiAdapter();
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "";
    try {
        const catalog = await adapter.discoverModels(apiKey, baseUrl);
        const has20Flash = catalog.some(m => m.modelId === "gemini-2.0-flash");
        console.log("has20Flash:", has20Flash);
        console.log("Catalog size:", catalog.length);
        console.log("Models:", catalog.map(m => m.modelId).join(", "));
    } catch(e: any) {
        console.log("FAILED:", e.message);
    }
}
run();
