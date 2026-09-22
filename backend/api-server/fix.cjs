const fs = require("fs");
const files = [
  "src/routes/widget-public.ts",
  "src/agents/businessAgent.ts",
  "src/services/knowledge.ts",
  "src/routes/reports/index.ts",
  "src/services/context-engine/intent-classifier.ts",
  "src/routes/gemini/index.ts"
];
for(const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, "utf8");
    // Strip lines matching model: "gemini-2.0-flash"
    content = content.replace(/\s*model:\s*"gemini-2\.0-flash",?/g, "");
    fs.writeFileSync(file, content);
  }
}
console.log("Done");
