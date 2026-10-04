import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

async function listEmbedModels() {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
  const rawUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
  const cleanUrl = rawUrl.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '');
  
  const response = await fetch(`${cleanUrl}/v1beta/models?key=${apiKey}`);
  const data = await response.json() as any;
  
  console.log("All models supporting embedContent or embedding:");
  const embedModels = (data.models || []).filter((m: any) => 
    m.supportedGenerationMethods?.includes("embedContent") ||
    m.supportedGenerationMethods?.includes("batchEmbedContents") ||
    m.name.includes("embed")
  );
  console.log(embedModels.map((m: any) => ({
    name: m.name,
    displayName: m.displayName,
    methods: m.supportedGenerationMethods
  })));
  process.exit(0);
}

listEmbedModels();
