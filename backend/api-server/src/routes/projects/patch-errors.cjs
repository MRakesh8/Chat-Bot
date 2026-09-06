const fs = require('fs');

let content = fs.readFileSync('index.ts', 'utf8');

// Replace standard err.message disclosures
content = content.replace(/res\.status\(500\)\.json\(\{ success: false, error: err\.message \|\| "Internal server error" \}\);/g, 
  'res.status(500).json({ success: false, error: "Internal server error", errorId: req.id });');

content = content.replace(/res\.status\(500\)\.json\(\{ error: "Internal server error", details: err\.message \}\);/g, 
  'res.status(500).json({ error: "Internal server error", errorId: req.id });');

content = content.replace(/res\.status\(500\)\.json\(\{ error: "Failed to fetch projects", message: err\.message \}\);/g, 
  'res.status(500).json({ error: "Failed to fetch projects", errorId: req.id });');

content = content.replace(/res\.status\(500\)\.json\(\{ error: err\.message \}\);/g, 
  'res.status(500).json({ error: "Internal server error", errorId: req.id });');

fs.writeFileSync('index.ts', content);
console.log('Errors Patched');
