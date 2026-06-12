const fs = require('fs');
let content = fs.readFileSync('src/routes/gemini/index.ts', 'utf8');
content = content.replace(/\\\`/g, '`').replace(/\\\$/g, '$').replace(/\\\\n/g, '\\n');
fs.writeFileSync('src/routes/gemini/index.ts', content);
