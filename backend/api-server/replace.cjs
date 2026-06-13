const fs = require('fs');
const file = 'd:/Project/Chat-bot/backend/api-server/src/services/knowledge.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  'const itemStr = `[KNOWLEDGE ITEM] (Category: ${match.categoryName || "Uncategorized"}, Type: ${match.sourceType})\\nTitle: ${match.title || "Untitled"}\\n${match.tag ? `Tag: ${match.tag}\\n` : ""}${match.notes ? `Notes:\\n${match.notes}\\n` : ""}${match.summary ? `Summary:\\n${match.summary}\\n` : ""}`;',
  'const itemStr = `[KNOWLEDGE ITEM] (Category: ${match.categoryName || "Uncategorized"}, Type: ${match.sourceType})\\nTitle: ${match.title || "Untitled"}\\n${match.tag ? `Tag: ${match.tag}\\n` : ""}${match.notes ? `Notes:\\n${match.notes}\\n` : ""}${match.summary ? `Summary:\\n${match.summary}\\n` : `Content snippet:\\n${match.rawContent?.slice(0, 1000) || ""}\\n`}`;'
);
fs.writeFileSync(file, content);
console.log('done');
