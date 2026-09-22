import { Queue, Worker, Job } from "bullmq";
import { processKnowledgeSource } from "../services/knowledge";
import { logger } from "./logger";
import { getRedisClient } from "./redis";

const REDIS_URL = process.env.REDIS_URL;

let redisConnection = getRedisClient();
let knowledgeQueue: Queue | null = null;
let knowledgeWorker: Worker | null = null;
let discoveryQueue: Queue | null = null;
let discoveryWorker: Worker | null = null;
let analyticsQueue: Queue | null = null;
let analyticsWorker: Worker | null = null;

if (redisConnection) {
  try {

    knowledgeQueue = new Queue("knowledge-processing", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    });

    logger.info("[QUEUE] BullMQ Queue initialized successfully.");
    
    analyticsQueue = new Queue("analytics-processing", { connection: redisConnection, defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } } });
    discoveryQueue = new Queue("discovery-processing", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    });
  } catch (err) {
    logger.error(err, "[QUEUE_ERROR] Failed to initialize Redis connection");
  }
} else {
  logger.warn("[QUEUE_WARN] REDIS_URL is not set. Falling back to in-process execution.");
}

// In-process concurrency control for fallbacks
const MAX_CONCURRENT_FALLBACKS = 2;
let activeFallbacks = 0;
const fallbackQueue: Array<() => Promise<void>> = [];

async function executeWithConcurrencyLimit(task: () => Promise<void>) {
  if (activeFallbacks >= MAX_CONCURRENT_FALLBACKS) {
    fallbackQueue.push(task);
    return;
  }
  
  activeFallbacks++;
  try {
    await task();
  } finally {
    activeFallbacks--;
    const nextTask = fallbackQueue.shift();
    if (nextTask) {
      // Defer to next tick to avoid stack overflow
      setImmediate(() => executeWithConcurrencyLimit(nextTask));
    }
  }
}

export async function enqueueKnowledgeProcessing(sourceId: string): Promise<void> {
  if (knowledgeQueue) {
    try {
      await knowledgeQueue.add("process-source", { sourceId });
      logger.info(`[QUEUE] Enqueued knowledge processing job for source ${sourceId}`);
      return;
    } catch (err) {
      logger.error(err, `[QUEUE_ERROR] Failed to enqueue job for source ${sourceId}, falling back to in-process execution.`);
    }
  }

  // Fallback: Run in-process asynchronously with limits
  logger.info(`[QUEUE_FALLBACK] Queued source ${sourceId} for in-process execution`);
  executeWithConcurrencyLimit(async () => {
    try {
      await processKnowledgeSource(sourceId);
    } catch (err) {
      logger.error(err, `[QUEUE_FALLBACK_ERROR] Async processing failed for source ${sourceId}`);
    }
  });
}

export async function enqueueDiscoveryProcessing(projectId: string, url: string, orgId: string): Promise<void> {
  if (discoveryQueue) {
    try {
      await discoveryQueue.add("process-discovery", { projectId, url, orgId });
      logger.info(`[QUEUE] Enqueued discovery job for project ${projectId}`);
      return;
    } catch (err) {
      logger.error(err, `[QUEUE_ERROR] Failed to enqueue discovery job for project ${projectId}, falling back to in-process execution.`);
    }
  }

  // Fallback: Run in-process asynchronously with limits
  logger.info(`[QUEUE_FALLBACK] Queued discovery for project ${projectId} for in-process execution`);
  executeWithConcurrencyLimit(async () => {
    try {
      const m = await import("../services/discovery");
      await m.WebsiteDiscoveryService.runDiscovery(projectId, url, orgId);
    } catch (err) {
      logger.error(err, `[QUEUE_FALLBACK_ERROR] Async discovery failed for project ${projectId}`);
    }
  });
}

// Worker Initialization Function
export function startQueueWorker(): void {
  if (redisConnection) startAnalyticsWorker();
  if (!redisConnection) {
    logger.warn("[QUEUE_WARN] Redis connection not active. Worker will not start.");
    return;
  }

  knowledgeWorker = new Worker(
    "knowledge-processing",
    async (job: Job) => {
      const { sourceId } = job.data;
      logger.info(`[WORKER] Processing job ${job.id} for source ${sourceId}`);
      await processKnowledgeSource(sourceId, { force: true });
    },
    {
      connection: redisConnection,
      concurrency: 2, // Process up to 2 files concurrently
    }
  );

  knowledgeWorker.on("completed", (job) => {
    logger.info(`[WORKER] Job ${job.id} completed successfully`);
  });

  knowledgeWorker.on("failed", (job, err) => {
    logger.error(err, `[WORKER_ERROR] Job ${job?.id} failed`);
  });

  logger.info("[WORKER] BullMQ Worker started successfully.");

  discoveryWorker = new Worker(
    "discovery-processing",
    async (job: Job) => {
      const { projectId, url, orgId } = job.data;
      logger.info(`[WORKER] Processing discovery job ${job.id} for project ${projectId}`);
      const m = await import("../services/discovery");
      await m.WebsiteDiscoveryService.runDiscovery(projectId, url, orgId);
    },
    {
      connection: redisConnection,
      concurrency: 2,
    }
  );

  discoveryWorker.on("completed", (job) => {
    logger.info(`[WORKER] Discovery job ${job.id} completed successfully`);
  });

  discoveryWorker.on("failed", (job, err) => {
    logger.error(err, `[WORKER_ERROR] Discovery job ${job?.id} failed`);
  });
}

export async function shutdownQueueWorker(): Promise<void> {
  if (knowledgeWorker) await knowledgeWorker.close();
  if (discoveryWorker) await discoveryWorker.close();
  if (redisConnection) {
    redisConnection.disconnect();
  }
}


export async function enqueueApiLog(logData: any) {
  if (analyticsQueue) {
    await analyticsQueue.add("api-log", logData);
  } else {
    // Fallback if no redis
    const { db } = await import("@workspace/db");
    const { apiLogs } = await import("@workspace/db/schema");
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
