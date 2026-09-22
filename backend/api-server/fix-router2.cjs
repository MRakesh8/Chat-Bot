const fs = require("fs");
const file = "src/services/ai-router/router.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
  /originalModelId\?: string\) \{\\n/,
  "originalModelId?: string) {\n"
);
content = content.replace(
  /\_originalModelId = initialResolved\.modelId;\\n/g,
  "_originalModelId = initialResolved.modelId;\n"
);

fs.writeFileSync(file, content);
console.log("Fixed syntax");
