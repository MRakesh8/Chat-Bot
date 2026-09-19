const fs = require('fs');

let r = fs.readFileSync('backend/api-server/src/services/ai-router/router.ts', 'utf8');
r = r.replaceAll('match.model ||', '');
fs.writeFileSync('backend/api-server/src/services/ai-router/router.ts', r);

let q = fs.readFileSync('backend/api-server/src/lib/queue.ts', 'utf8');
q = q.replace('import { getRedisClient } from "./redis";\nimport { getRedisClient } from "./redis";', 'import { getRedisClient } from "./redis";');
fs.writeFileSync('backend/api-server/src/lib/queue.ts', q);
