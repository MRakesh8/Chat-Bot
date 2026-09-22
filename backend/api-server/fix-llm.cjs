const fs = require("fs");
const file = "src/services/llm-provider.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
  /if \(actualModel === "gemini-1\.5-flash"\) actualModel = "gemini-2\.0-flash";/g,
  ""
);

fs.writeFileSync(file, content);
console.log("Patched llm-provider");
