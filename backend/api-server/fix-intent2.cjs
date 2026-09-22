const fs = require("fs");
const file = "src/services/context-engine/intent-classifier.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
  /const response = await client\.models\.generateContent\(\{[\s\S]*?contents: prompt,/g,
  "const response = await client.models.generateContent({\n        model: \"gemini-1.5-flash\",\n        contents: prompt,"
);

fs.writeFileSync(file, content);
console.log("Patched intent-classifier");
