const fs = require("fs");
const files = [
  "src/routes/files/index.ts",
  "src/routes/projects/index.ts",
  "src/routes/projects/widget.ts",
  "src/services/llm-provider.ts",
  "src/services/provider-verifier.ts"
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, "utf8");
    // For files, projects, etc., strip model: "gemini-2.0-flash"
    content = content.replace(/\s*model:\s*"gemini-2\.0-flash",?/g, "");
    // For llm-provider mapping 1.5-flash to 2.0-flash:
    content = content.replace(/if \(actualModel === "gemini-1\.5-flash"\) actualModel = "gemini-2\.0-flash";/g, "");
    
    // For provider-verifier defaultModel
    content = content.replace(/models\.includes\("gemini-2\.0-flash"\) \? "gemini-2\.0-flash" : models\.includes\("gemini-2\.0-flash-lite"\) \? "gemini-2\.0-flash-lite" : models\[0\] || "gemini-2\.0-flash"/g, 
      "models.includes(\"gemini-2.5-flash\") ? \"gemini-2.5-flash\" : models.includes(\"gemini-1.5-flash\") ? \"gemini-1.5-flash\" : models[0] || \"gemini-1.5-flash\"");
    
    fs.writeFileSync(file, content);
  }
}
console.log("Fixed more");
