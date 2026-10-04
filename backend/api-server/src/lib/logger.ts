import pino from "pino";
import { db } from "@workspace/db";
import { systemErrors } from "@workspace/db";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Sanitizes error objects to prevent leaking raw provider JSON payloads,
 * internal URLs, quota metric internals, API keys, or tokens to Pino logs.
 */
function sanitizeError(err: any): any {
  if (!err) return err;

  const rawMsg = typeof err === "string" ? err : (err.message || String(err));
  let cleanMsg = rawMsg
    .replace(/AIza[0-9A-Za-z-_]{35}/g, "[REDACTED_API_KEY]")
    .replace(/sk-[0-9A-Za-z]{20,}/g, "[REDACTED_API_KEY]")
    .replace(/shpat_[0-9a-fA-F]{32}/g, "[REDACTED_SHOPIFY_TOKEN]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/g, "Bearer [REDACTED]");

  let providerStatus: number | undefined = err?.status || err?.response?.status || err?.statusCode;
  let errorType = "ERROR";

  // If error message is a raw Google GenAI JSON payload
  if (cleanMsg.includes("RESOURCE_EXHAUSTED") || cleanMsg.includes("quota") || providerStatus === 429) {
    providerStatus = 429;
    errorType = "QUOTA_EXCEEDED";
    cleanMsg = "Gemini API Quota Exceeded (RESOURCE_EXHAUSTED: rate/quota limit reached)";
  } else if (cleanMsg.includes("NOT_FOUND") || providerStatus === 404) {
    providerStatus = 404;
    errorType = "MODEL_NOT_FOUND";
    cleanMsg = "Gemini API Model Not Found (NOT_FOUND)";
  } else if (cleanMsg.includes("INVALID_CREDENTIAL") || cleanMsg.includes("API key not valid") || providerStatus === 401 || providerStatus === 403) {
    providerStatus = providerStatus || 401;
    errorType = "INVALID_CREDENTIAL";
    cleanMsg = "Gemini API Invalid Credential";
  }

  return {
    type: err.name || errorType,
    errorType,
    status: providerStatus,
    message: cleanMsg,
    code: err.code || errorType,
  };
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  serializers: {
    err: sanitizeError,
    error: sanitizeError,
  },
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "*.apiKey",
    "*.accessToken",
    "*.encryptedKey",
    "*.encryptedCredentials",
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
  const sanitized = sanitizeError(err);
  const errorMessage = sanitized.message || "System error";
  
  logger.error({ err: sanitized, context }, `[${source}] System Error: ${errorMessage}`);
  
  try {
    await db.insert(systemErrors).values({
      source,
      message: errorMessage,
      stack: "", // Do not store raw stack traces containing potential provider payloads
      context: context || {},
    });
  } catch (dbErr) {
    logger.error({ dbErr: sanitizeError(dbErr) }, "Failed to write system error to database");
  }
};

