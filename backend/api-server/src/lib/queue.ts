import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { processKnowledgeSource } from "../services/knowledge";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL;

let redisConnection: Redis | null = null;
let knowledgeQueue: Queue | null = null;
let knowledgeWorker: Worker | null = null;

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
}
