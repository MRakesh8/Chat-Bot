const fs = require("fs");
const file = "src/services/ai-router/router.ts";
let content = fs.readFileSync(file, "utf8");

// We need to replace match.model for User and System keys.
// The Project key one is on line 22 roughly. The other two are around 43 and 64.

// Let us split by "Attempt"
const parts = content.split("// Attempt");
if (parts.length >= 4) {
  // parts[2] is User API Key
  parts[2] = parts[2].replace("modelId: preferredModel || match.model || \"default\"", "modelId: preferredModel || \"default\"");
  // parts[3] is Global System Config Fallback
  parts[3] = parts[3].replace("modelId: preferredModel || match.model || \"default\"", "modelId: preferredModel || \"default\"");
  
  content = parts.join("// Attempt");
}

fs.writeFileSync(file, content);
console.log("Patched router4");
