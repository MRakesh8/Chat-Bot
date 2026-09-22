const fs = require("fs");
const file = "src/services/context-engine/intent-classifier.ts";
let content = fs.readFileSync(file, "utf8");
content = content.replace(
  "      const response = await client.models.generateContent({ // Using standard flash, fallback allowed\n        contents: prompt,",
  "      const response = await client.models.generateContent({\n        model: \"gemini-1.5-flash\", // Using standard flash\n        contents: prompt,"
);
fs.writeFileSync(file, content);

