const fs = require('fs');
let c = fs.readFileSync('src/lib/queue.ts', 'utf8');

c = c.replace(
  'import { logger } from "./logger";',
  'import { logger } from "./logger";\nimport { getRedisClient } from "./redis";'
);
c = c.replace(
  'let redisConnection: Redis | null = null;',
  'let redisConnection = getRedisClient();'
);
c = c.replace(
  'if (REDIS_URL) {',
  'if (redisConnection) {'
);
c = c.replace(
  /    redisConnection = new Redis[\s\S]*?\}\);/m,
  ''
);

c = c.replace(
  'let discoveryWorker: Worker | null = null;',
  'let discoveryWorker: Worker | null = null;\nlet analyticsQueue: Queue | null = null;\nlet analyticsWorker: Worker | null = null;'
);

c = c.replace(
  'discoveryQueue = new Queue("discovery-processing"',
  'analyticsQueue = new Queue("analytics-processing", { connection: redisConnection, defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } } });\n    discoveryQueue = new Queue("discovery-processing"'
);

c = c.replace(
  'export function startQueueWorker(): void {',
  'export function startQueueWorker(): void {\n  if (redisConnection) startAnalyticsWorker();'
);

const analyticsFunctions = `
export async function enqueueApiLog(logData: any) {
  if (analyticsQueue) {
    await analyticsQueue.add("api-log", logData);
  } else {
    // Fallback if no redis
    const { db } = require("@workspace/db");
    const { apiLogs } = require("@workspace/db/schema");
    db.insert(apiLogs).values(logData).catch((e: any) => logger.error(e, "Fallback insert error"));
  }
}

export function startAnalyticsWorker() {
  if (!redisConnection) return;
  analyticsWorker = new Worker("analytics-processing", async (job: Job) => {
    const { db } = require("@workspace/db");
    const { apiLogs } = require("@workspace/db/schema");
    if (job.name === "api-log") {
      await db.insert(apiLogs).values(job.data);
    }
  }, {
    connection: redisConnection,
    concurrency: 5
  });
  
  analyticsWorker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "[ANALYTICS_WORKER_ERROR] Failed to process analytics");
  });
}
`;

fs.writeFileSync('src/lib/queue.ts', c + '\n' + analyticsFunctions);
