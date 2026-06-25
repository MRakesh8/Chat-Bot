import app from "./app";
import { logger } from "./lib/logger";
import { startCleanupTask } from "./lib/cleanup";
import { startApiKeyHealthCheckTask } from "./lib/apiKeyHealthCheck";
import { runMigrations } from "./lib/migrate";
import { validateDatabaseSchema } from "./middlewares/databaseHealth";
import puppeteer from "puppeteer";
import fs from "fs";

const rawPort = process.env["PORT"];


const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  try {
    await runMigrations();
  } catch (err) {
    logger.error(err, "Failed to run migrations on startup");
  }

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
    
    // Background validation
    validateDatabaseSchema().catch((err) => {
      logger.error({ err }, "[DB] Background validation failed");
    });
  });

  server.on("error", (err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
}

start();
