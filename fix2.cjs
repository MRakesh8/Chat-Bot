const fs = require('fs');
let q = fs.readFileSync('backend/api-server/src/lib/queue.ts', 'utf8');
q = q.replace(/import \{ getRedisClient \} from "\.\/redis";\r?\nimport \{ getRedisClient \} from "\.\/redis";/m, 'import { getRedisClient } from "./redis";');
fs.writeFileSync('backend/api-server/src/lib/queue.ts', q);
