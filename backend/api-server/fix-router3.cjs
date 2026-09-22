const fs = require("fs");
const file = "src/services/ai-router/router.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(/static async persistRepairedModel[\s\S]*?console.error\("\[AI-ROUTER\] Failed to persist repaired model", e\);\n    }\n  }/, `static async persistRepairedModel(initialResolved: ResolvedModel, finalResolved: ResolvedModel) {
    if (initialResolved.modelId === finalResolved.modelId) return;
    try {
      const { auditLogs } = await import("@workspace/db/schema");

      if (initialResolved.credential.type === "project") {
        await db.update(projectApiKeys)
          .set({ model: finalResolved.modelId })
          .where(eq(projectApiKeys.id, initialResolved.credential.id));
      } else if (initialResolved.credential.type === "user") {
        // userApiKeys does not have a "model" column, but we log the change.
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
  }`);

fs.writeFileSync(file, content);
console.log("Patched router3");
