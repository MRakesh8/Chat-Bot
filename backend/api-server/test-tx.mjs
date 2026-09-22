import { config } from "dotenv";
config({ path: "../../.env" });
import { UniversalRouterService } from "./src/services/ai-router/router.js";
import { db } from "@workspace/db";
import { projectApiKeys, projects } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { crypto } from "@workspace/db";

async function run() {
    await db.transaction(async (tx) => {
        console.log("Starting test transaction...");
        
        // 1. Get an existing project ID to attach to
        const [proj] = await tx.select({ id: projects.id }).from(projects).limit(1);
        if (!proj) throw new Error("No projects found to attach test key to");
        
        // 2. Insert test key
        const testKeyId = "11111111-1111-1111-1111-111111111111";
        const envKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
        if (!envKey) throw new Error("No API key in env");
        
        await tx.insert(projectApiKeys).values({
            id: testKeyId,
            projectId: proj.id,
            name: "Test Repair Key",
            provider: "gemini",
            encryptedKey: crypto.encrypt(envKey),
            maskedKey: "test",
            model: "gemini-2.0-flash", // The retired model
            isEnabled: true,
            isPrimary: true
        });
        
        console.log("Inserted test key with model: gemini-2.0-flash");
        
        // 3. We must mock the db inside router so it uses `tx`?
        // Ah, the router uses the global `db` instance. A transaction might not share the same connection if router imports `db`.
        // If we can't mock `db` in router easily, let's just update the real DB and delete it after.
        
        throw new Error("Rollback");
    }).catch(e => {
        if (e.message !== "Rollback") console.error(e);
        console.log("Rolled back.");
    });
}
run();
