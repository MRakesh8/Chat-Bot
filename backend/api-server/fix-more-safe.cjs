const fs = require("fs");
const files = [
  "src/routes/files/index.ts",
  "src/routes/projects/index.ts",
  "src/routes/projects/widget.ts",
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, "utf8");
    
    // Instead of completely removing, let's comment it out or safely remove the line
    const lines = content.split("\n");
    const newLines = lines.filter(line => !line.includes("model: \"gemini-2.0-flash\""));
    fs.writeFileSync(file, newLines.join("\n"));
  }
}
console.log("Fixed more safely");
