import { config } from "dotenv";
config({ path: "../../.env" });
import { UniversalRouterService } from "./src/services/ai-router";
import { db, crypto } from "@workspace/db";
import { projectApiKeys } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

async function run() {
    const results = await db.select().from(projectApiKeys).where(eq(projectApiKeys.provider, "gemini")).limit(1);
    const key = results[0];
    
    const validKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "";
    if (validKey) {
        const encrypted = crypto.encrypt(validKey);
        await db.update(projectApiKeys).set({ encryptedKey: encrypted, model: "gemini-2.0-flash" }).where(eq(projectApiKeys.id, key.id));
    }
    
    console.log("Set model to gemini-2.0-flash and injected valid key. Testing repair...");
    
    const req = {
       projectId: key.projectId,
       capabilities: { textGeneration: true },
       operation: "chat" as const
    };
    
    try {
        const response = await UniversalRouterService.executeChat(req, [{role: "user", content: "Ping"}], 0.7);
        console.log("Response:", response.content);
        
        const updatedResults = await db.select().from(projectApiKeys).where(eq(projectApiKeys.id, key.id));
        console.log("New DB model:", updatedResults[0].model);
        if (updatedResults[0].model !== "gemini-2.0-flash") {
           console.log("SUCCESS! Model was repaired");
        } else {
           console.log("FAILURE! Model was NOT repaired");
        }
    } catch (e: any) {
        console.log("Error:", e.message);
    }
    process.exit(0);
}
run();
