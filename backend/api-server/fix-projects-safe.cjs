const fs = require("fs");
const file = "src/routes/projects/index.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(/model:\s*"gemini-2\.0-flash"/g, "model: undefined");

fs.writeFileSync(file, content);
console.log("Patched projects index safe");
