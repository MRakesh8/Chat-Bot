const fs = require("fs");
const file = "src/services/ai-router/router.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(/const \{ updateKeyStats \} = require\("\.\.\/api-health"\);/g, "const { updateKeyStats } = await import(\"../api-health\");");

fs.writeFileSync(file, content);
console.log("Patched health");
