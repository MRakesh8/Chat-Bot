import { config } from "dotenv";
config({ path: "../../.env" });
import { UniversalRouterService } from "./src/services/ai-router/router";
import { db } from "@workspace/db";
import { projectApiKeys, projects } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { crypto } from "@workspace/db";

async function run() {
    const [proj] = await db.select({ id: projects.id }).from(projects).limit(1);
    const testKeyId = "11111111-1111-1111-1111-111111111111";
    const envKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    await db.delete(projectApiKeys).where(eq(projectApiKeys.id, testKeyId));
    await db.insert(projectApiKeys).values({
        id: testKeyId, projectId: proj.id, name: "Test Repair Key", provider: "gemini",
        encryptedKey: crypto.encrypt(envKey), maskedKey: "test", model: "gemini-7.0-fake-retired",
        isEnabled: true, isPrimary: true
    });
    try {
        const stream = UniversalRouterService.executeStream({
            projectId: proj.id, operation: "chat", capabilities: { textGeneration: true }
        }, [{ role: "user", content: "Hello" }]);
        let out = "";
        for await (const chunk of stream) {
            if ((chunk as any).text) out += (chunk as any).text;
            if ((chunk as any).content) out += (chunk as any).content;
        }
        console.log("Generation Success. Output length:", out.length);
        
        const [repairedKey] = await db.select().from(projectApiKeys).where(eq(projectApiKeys.id, testKeyId));
        console.log("New model in DB:", repairedKey.model);
    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        await db.delete(projectApiKeys).where(eq(projectApiKeys.id, testKeyId));
    }
}
run().then(() => process.exit(0));
