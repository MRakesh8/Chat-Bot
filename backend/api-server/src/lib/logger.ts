import pino from "pino";
import { db } from "@workspace/db";
import { systemErrors } from "@workspace/db";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

export const logSystemError = async (source: string, err: Error | any, context?: any) => {
  const errorMessage = err?.message || String(err);
  const errorStack = err?.stack || "";
  
  logger.error({ err, context }, `[${source}] System Error: ${errorMessage}`);
  
  try {
    await db.insert(systemErrors).values({
      source,
      message: errorMessage,
      stack: errorStack,
      context: context || {},
    });
  } catch (dbErr) {
    logger.error({ dbErr }, "Failed to write system error to database");
  }
};
