const fs = require("fs");
const file = "src/routes/widget-public.ts";
let content = fs.readFileSync(file, "utf8");
content = content.replace(/model: "gemini-2\.0-flash",\s*/g, "");
fs.writeFileSync(file, content);
