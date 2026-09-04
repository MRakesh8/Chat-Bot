import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { processKnowledgeSource } from "../services/knowledge";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL;

let redisConnection: Redis | null = null;
let knowledgeQueue: Queue | null = null;
let knowledgeWorker: Worker | null = null;
let discoveryQueue: Queue | null = null;
let discoveryWorker: Worker | null = null;

if (REDIS_URL) {
  try {
    redisConnection = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
      retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        return delay;
      }
    });

    redisConnection.on("error", (err) => {
      logger.error(err, "[REDIS_ERROR] Redis connection error");
    });

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

  // Fallback: Run in-process asynchronously
  logger.info(`[QUEUE_FALLBACK] Processing source ${sourceId} in-process`);
  processKnowledgeSource(sourceId).catch((err) => {
    logger.error(err, `[QUEUE_FALLBACK_ERROR] Async processing failed for source ${sourceId}`);
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

  // Fallback: Run in-process asynchronously
  logger.info(`[QUEUE_FALLBACK] Processing discovery for project ${projectId} in-process`);
  import("../services/discovery").then(m => {
    m.WebsiteDiscoveryService.runDiscovery(projectId, url, orgId).catch((err) => {
      logger.error(err, `[QUEUE_FALLBACK_ERROR] Async discovery failed for project ${projectId}`);
    });
  });
}

// Worker Initialization Function
export function startQueueWorker(): void {
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
