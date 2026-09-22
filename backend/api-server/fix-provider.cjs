const fs = require("fs");
const file = "src/services/provider-verifier.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
  /models\.includes\("gemini-2\.0-flash"\) \? "gemini-2\.0-flash" : models\.includes\("gemini-2\.0-flash-lite"\) \? "gemini-2\.0-flash-lite" : models\[0\] \|\| "gemini-2\.0-flash"/g,
  "models.includes(\"gemini-2.5-flash\") ? \"gemini-2.5-flash\" : models.includes(\"gemini-1.5-flash\") ? \"gemini-1.5-flash\" : models[0] || \"gemini-1.5-flash\""
);

fs.writeFileSync(file, content);
console.log("Patched provider-verifier");
