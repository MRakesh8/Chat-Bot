const fs = require("fs");
const file = "src/services/ai-router/router.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
  "yield* stream;",
  "yield* stream;\n        if (wasRepaired) await this.persistRepairedModel(initialResolved, resolved);"
);

const oldBlock = `resolved = await this.selectModel(initialResolved, req);
           continue;`;

const newBlock = `resolved = await this.selectModel(initialResolved, req);
           wasRepaired = true;
           continue;`;

// We just replace the last occurrence (executeStream's) by doing a split/join
const parts = content.split(oldBlock);
if (parts.length === 3) {
  content = parts[0] + oldBlock + parts[1] + newBlock + parts[2];
}

fs.writeFileSync(file, content);
console.log("Patched stream");
