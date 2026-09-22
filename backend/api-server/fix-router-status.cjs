const fs = require("fs");
const file = "src/services/ai-router/router.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(/status,/g, "status: status as any,");

fs.writeFileSync(file, content);
console.log("Patched router status");
