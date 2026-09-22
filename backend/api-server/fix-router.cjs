const fs = require("fs");
const file = "src/services/ai-router/router.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(/if \(req\.preferredModel && resolved\.modelId !== "default"\) \{/, 
  "if (resolved.modelId && resolved.modelId !== \"default\") {");

fs.writeFileSync(file, content);
console.log("Patched router");
