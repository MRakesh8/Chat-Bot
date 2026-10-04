import app from "./app";
import { logger } from "./lib/logger";
import { startCleanupTask } from "./lib/cleanup";
import { startApiKeyHealthCheckTask } from "./lib/apiKeyHealthCheck";
import { startSupabaseKeepAliveTask } from "./lib/supabaseKeepAlive";
import { runMigrations } from "./lib/migrate";
import { validateDatabaseSchema } from "./middlewares/databaseHealth";
import puppeteer from "puppeteer";
import fs from "fs";
import { startQueueWorker } from "./lib/queue";

const rawPort = process.env["PORT"] || process.env["BACKEND_PORT"] || "5000";


const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  try {
    const executablePath = await puppeteer.executablePath();
    if (!fs.existsSync(executablePath)) {
      logger.error(`[PUPPETEER] Chrome executable not found at ${executablePath}. PDF generation will fail.`);
    } else {
      logger.info(`[PUPPETEER] Chrome verified at ${executablePath}`);
    }
  } catch (e: any) {
    logger.error({ err: e }, "[PUPPETEER] Failed to resolve Chrome path");
  }

  logger.info("[STARTUP] SERVER_START");

  const server = app.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "[STARTUP] Server listening on port " + port);
    logger.info("[STARTUP] HEALTH_ENDPOINT_READY");
    startCleanupTask();
    startApiKeyHealthCheckTask();
    startSupabaseKeepAliveTask();
    startQueueWorker();
    
    // Background recovery for WhatsApp
    setInterval(() => {
      import("./services/whatsapp/processor").then(m => {
        m.WhatsAppProcessor.recoverPendingMessages().catch(err => logger.error(err, "WA Recovery failed"));
      });
    }, 60000); // every 1 minute
    
    // Background validation
    validateDatabaseSchema().catch((err) => {
      logger.error({ err }, "[DB] Background validation failed");
    });
  });

  server.on("error", (err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`[SHUTDOWN] Received ${signal}, starting graceful shutdown...`);
    server.close(async () => {
      logger.info("[SHUTDOWN] HTTP server closed.");
      try {
        const { pool } = await import("@workspace/db");
        await pool.end();
        logger.info("[SHUTDOWN] Database pool closed.");
        
        const { shutdownQueueWorker } = await import("./lib/queue");
        await shutdownQueueWorker();
        logger.info("[SHUTDOWN] Queue worker closed.");
      } catch (err) {
        logger.error({ err }, "[SHUTDOWN] Error during shutdown");
      }
      process.exit(0);
    });

    // Force shutdown after 10s
    setTimeout(() => {
      logger.error("[SHUTDOWN] Forced exit after timeout.");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
