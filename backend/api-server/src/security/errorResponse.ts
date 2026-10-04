import type { Request, Response } from "express";
import crypto from "crypto";

export interface SafeErrorResponse {
  error: string;
  message: string;
  requestId: string;
  details?: any;
}

/**
 * Utility to extract or generate a unique request ID for logs and client responses.
 */
export function getRequestId(req: Request): string {
  if (req.id && typeof req.id === "string") {
    return req.id;
  }
  const headerId = req.headers["x-request-id"];
  if (typeof headerId === "string" && headerId) {
    return headerId;
  }
  const newId = crypto.randomUUID();
  (req as any).id = newId;
  return newId;
}

/**
 * Creates a standard safe client error response object.
 * Strips sensitive stack traces and internal errors.
 */
export function createSafeErrorResponse(
  code: string,
  message: string,
  requestId?: string,
  publicDetails?: any
): SafeErrorResponse {
  return {
    error: code,
    message,
    requestId: requestId || crypto.randomUUID(),
    ...(publicDetails ? { details: publicDetails } : {}),
  };
}

export type ProviderErrorType =
  | "INVALID_CREDENTIAL"
  | "MODEL_NOT_FOUND"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_REQUEST"
  | "NETWORK_ERROR"
  | "UNKNOWN_PROVIDER_ERROR";

export interface ClassifiedProviderError {
  type: ProviderErrorType;
  status: number;
  retryable: boolean;
  retryDelaySeconds?: number;
  isDailyQuota: boolean;
  sanitizedMessage: string;
  userMessage: string;
  customerMessage: string;
}

/**
 * Authoritative classification of AI provider errors (Google GenAI, OpenAI, Anthropic, HTTP errors).
 * Strictly redacts internal URLs, quota metric names, secrets, and raw internal JSON payloads.
 */
export function classifyProviderError(error: any): ClassifiedProviderError {
  let status = error?.status || error?.response?.status || error?.statusCode || 500;
  const rawMsg = typeof error === "string" ? error : (error?.message || error?.error?.message || String(error || ""));
  const msgLower = rawMsg.toLowerCase();

  let parsedJson: any = null;
  if (rawMsg.startsWith("{") && rawMsg.endsWith("}")) {
    try {
      parsedJson = JSON.parse(rawMsg);
    } catch {}
  } else if (error?.error && typeof error.error === "object") {
    parsedJson = error;
  }

  const errStatusStr = parsedJson?.error?.status || "";
  const errCode = parsedJson?.error?.code;
  if (errCode && typeof errCode === "number") {
    status = errCode;
  }

  let retryDelaySeconds: number | undefined = undefined;
  if (parsedJson?.error?.details && Array.isArray(parsedJson.error.details)) {
    for (const d of parsedJson.error.details) {
      if (d?.retryDelay) {
        const match = String(d.retryDelay).match(/^(\d+(?:\.\d+)?)\s*s?$/i);
        if (match) {
          retryDelaySeconds = Math.round(parseFloat(match[1]));
        }
      }
    }
  }

  let type: ProviderErrorType = "UNKNOWN_PROVIDER_ERROR";
  let isDailyQuota = false;
  let retryable = false;

  if (
    status === 429 ||
    errStatusStr === "RESOURCE_EXHAUSTED" ||
    msgLower.includes("resource_exhausted") ||
    msgLower.includes("quota exceeded") ||
    msgLower.includes("generaterequestsperday") ||
    msgLower.includes("daily_requests") ||
    msgLower.includes("rate limit") ||
    msgLower.includes("rate_limited") ||
    msgLower.includes("too many requests")
  ) {
    status = 429;
    const isDaily =
      msgLower.includes("generaterequestsperday") ||
      msgLower.includes("daily") ||
      msgLower.includes("freetier") ||
      (retryDelaySeconds !== undefined && retryDelaySeconds > 300);

    if (isDaily || errStatusStr === "RESOURCE_EXHAUSTED" || msgLower.includes("quota exceeded")) {
      type = "QUOTA_EXCEEDED";
      isDailyQuota = true;
      retryable = false;
    } else {
      type = "RATE_LIMITED";
      isDailyQuota = false;
      retryable = true;
    }
  } else if (
    status === 401 ||
    status === 403 ||
    errStatusStr === "PERMISSION_DENIED" ||
    errStatusStr === "UNAUTHENTICATED" ||
    msgLower.includes("invalid api key") ||
    msgLower.includes("invalid_credential") ||
    msgLower.includes("api key not valid") ||
    msgLower.includes("permission_denied") ||
    msgLower.includes("unauthenticated")
  ) {
    type = "INVALID_CREDENTIAL";
    status = status === 403 ? 403 : 401;
    retryable = false;
  } else if (
    status === 404 ||
    errStatusStr === "NOT_FOUND" ||
    msgLower.includes("model_not_found") ||
    msgLower.includes("not found for url") ||
    msgLower.includes("is not found") ||
    (msgLower.includes("models/") && msgLower.includes("not found")) ||
    msgLower.includes("unsupported for generatecontent")
  ) {
    type = "MODEL_NOT_FOUND";
    status = 404;
    retryable = true;
  } else if (status === 400 || errStatusStr === "INVALID_ARGUMENT" || msgLower.includes("invalid_argument")) {
    type = "INVALID_REQUEST";
    status = 400;
    retryable = false;
  } else if (
    status === 503 ||
    status === 502 ||
    status === 504 ||
    status === 500 ||
    errStatusStr === "UNAVAILABLE" ||
    msgLower.includes("unavailable") ||
    msgLower.includes("overloaded") ||
    msgLower.includes("busy")
  ) {
    type = "PROVIDER_UNAVAILABLE";
    status = status >= 500 ? status : 503;
    retryable = true;
  } else if (
    msgLower.includes("enotfound") ||
    msgLower.includes("econnreset") ||
    msgLower.includes("etimedout") ||
    msgLower.includes("abort") ||
    msgLower.includes("fetch failed")
  ) {
    type = "NETWORK_ERROR";
    status = 504;
    retryable = true;
  }

  const userMessage =
    type === "QUOTA_EXCEEDED" || type === "RATE_LIMITED"
      ? "⚠️ The AI service is temporarily unavailable because the current AI connection has reached its usage limit. Please try again later or check the project's AI/API connection."
      : type === "INVALID_CREDENTIAL"
      ? "⚠️ AI service credential is invalid or expired. Please check your project's AI API key settings."
      : type === "PROVIDER_UNAVAILABLE" || type === "NETWORK_ERROR"
      ? "⚠️ The AI service is temporarily busy or unreachable. Please try again in a moment."
      : "⚠️ Something went wrong with the AI service. Please try sending your message again.";

  const customerMessage = "Hi! 👋 I'm temporarily having trouble processing messages right now. Please try again later.";

  return {
    type,
    status,
    retryable,
    retryDelaySeconds,
    isDailyQuota,
    sanitizedMessage: `[AI_PROVIDER_${type}] (HTTP ${status})${retryDelaySeconds ? ` retry after ${retryDelaySeconds}s` : ""}`,
    userMessage,
    customerMessage,
  };
}

/**
 * Express response helper to send safe JSON error.
 */
export function sendSafeError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  req?: Request,
  publicDetails?: any
): Response {
  const requestId = req ? getRequestId(req) : crypto.randomUUID();
  return res.status(statusCode).json(
    createSafeErrorResponse(code, message, requestId, publicDetails)
  );
}
