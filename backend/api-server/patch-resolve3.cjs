const fs = require("fs");
const file = "src/services/ai-router/router.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
  /modelId: preferredModel \|\| "default"/g,
  "modelId: preferredModel || match.model || \"default\""
);

fs.writeFileSync(file, content);
console.log("Patched resolve system");
