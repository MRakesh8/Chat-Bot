const fs = require("fs");
const file = "src/services/ai-router/router.ts";
let content = fs.readFileSync(file, "utf8");

if (!content.includes("persistRepairedModel")) {
  // Add persistRepairedModel method
  const persistMethod = `
  static async persistRepairedModel(initialResolved: ResolvedModel, finalResolved: ResolvedModel) {
    if (initialResolved.modelId === finalResolved.modelId) return;
    try {
      const { db } = require("@workspace/db");
      const { projectApiKeys, userApiKeys, auditLogs } = require("@workspace/db/schema");
      const { eq } = require("drizzle-orm");

      if (initialResolved.credential.type === "project") {
        await db.update(projectApiKeys)
          .set({ model: finalResolved.modelId })
          .where(eq(projectApiKeys.id, initialResolved.credential.id));
      } else if (initialResolved.credential.type === "user") {
        // userApiKeys does not have a "model" column, but we can log the change.
        // It relies on availableModels, which get refreshed automatically anyway.
      } else if (initialResolved.credential.type === "system") {
        // System keys are global; avoid mutating blindly unless supported.
      }

      await db.insert(auditLogs).values({
        userId: initialResolved.credential.type === "user" ? initialResolved.credential.id : null,
        action: "MODEL_AUTO_SUBSTITUTION",
        target: initialResolved.credential.id,
      } as any);
      
      console.log(\`[AI-ROUTER] Automatically substituted \${initialResolved.modelId} -> \${finalResolved.modelId} for \${initialResolved.credential.type} key \${initialResolved.credential.id}\`);
    } catch (e) {
      console.error("[AI-ROUTER] Failed to persist repaired model", e);
    }
  }
`;
  content = content.replace("static async executeChat", persistMethod + "\n  static async executeChat");

  // Modify executeChat
  content = content.replace("let attempt = 0;", "let attempt = 0;\n    let wasRepaired = false;");
  
  // Insert wasRepaired check inside the try block (just before updateKeyStats)
  content = content.replace(
    "const { updateKeyStats } = require(\"../api-health\");",
    "if (wasRepaired) await this.persistRepairedModel(initialResolved, resolved);\n        const { updateKeyStats } = require(\"../api-health\");"
  );

  // Update wasRepaired in the catch block
  content = content.replace(
    "resolved = await this.selectModel(initialResolved, req);",
    "resolved = await this.selectModel(initialResolved, req);\n           wasRepaired = true;"
  );

  // Apply same to executeStream
  content = content.replace("static async *executeStream(req: RoutingRequirement, messages: any[], temperature?: number) {", "static async *executeStream(req: RoutingRequirement, messages: any[], temperature?: number) {\n    let wasRepaired = false;");
  
  // Actually executeStream is slightly different. Let us just find its attempt loop
  // executeStream has `let attempt = 0;` as well. 
  // Let's just use regex for both:
}
fs.writeFileSync(file, content);
console.log("Patched router.ts");
