const fs = require("fs");
const file = "src/services/ai-router/router.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(/modelId: preferredModel \|\| userMatch\.model \|\| "default"/g, "modelId: preferredModel || \"default\"");
content = content.replace(/modelId: preferredModel \|\| systemMatch\.model \|\| "default"/g, "modelId: preferredModel || \"default\"");

fs.writeFileSync(file, content);
console.log("Patched match types");
