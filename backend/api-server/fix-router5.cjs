const fs = require("fs");
const file = "src/services/ai-router/router.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
  "provider: match.provider,\n          modelId: preferredModel || match.model || \"default\",\n          credential: { id: match.id, apiKey: crypto.decrypt(match.encryptedKey) || match.encryptedKey, type: \"system\" }",
  "provider: match.provider,\n          modelId: preferredModel || \"default\",\n          credential: { id: match.id, apiKey: crypto.decrypt(match.encryptedKey) || match.encryptedKey, type: \"system\" }"
);

fs.writeFileSync(file, content);
console.log("Patched router5");
