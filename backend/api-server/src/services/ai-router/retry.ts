export interface RetryOptions {
  maxRetries?: number; // default: 2
  baseDelayMs?: number; // default: 300
  maxDelayMs?: number; // default: 2000
  jitterMs?: number; // default: 200
  deadlineMs?: number; // default: 20000
}

export class AllAiProvidersFailedError extends Error {
  readonly code = "PROVIDER_UNAVAILABLE";
  readonly allFailed = true;
  readonly lastError?: any;

  constructor(message: string, lastError?: any) {
    super(message);
    this.name = "AllAiProvidersFailedError";
    this.lastError = lastError;
  }
}

/**
 * Checks if an error is transient and eligible for bounded backoff retries.
 * Transient errors include 429 (rate limits/quota) and 5xx (500, 502, 503, 504) as well as network connection glitches.
 */
export function isTransientError(status: string, error?: any): boolean {
  if (status === "PROVIDER_UNAVAILABLE" || status === "RATE_LIMITED") {
    return true;
  }

  const httpStatus = error?.status || error?.response?.status || error?.statusCode || error?.code || error?.error?.code;
  if (typeof httpStatus === "number" && (httpStatus === 429 || httpStatus === 500 || httpStatus === 502 || httpStatus === 503 || httpStatus === 504)) {
    return true;
  }

  const gRpcStatus = (error?.error?.status || error?.status || "").toString().toUpperCase();
  if (gRpcStatus === "UNAVAILABLE" || gRpcStatus === "RESOURCE_EXHAUSTED" || gRpcStatus === "DEADLINE_EXCEEDED") {
    return true;
  }

  const msg = (error?.message || String(error || "")).toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("502") ||
    msg.includes("504") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("high demand") ||
    msg.includes("rate limit") ||
    msg.includes("resource_exhausted") ||
    msg.includes("fetch failed") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("network error")
  );
}

/**
 * Checks if an error indicates a permanent credential rejection (401, 403, bad API key).
 * Permanent credential failures must NOT be retried on the same credential.
 */
export function isPermanentCredentialError(status: string, error?: any): boolean {
  if (status === "INVALID_CREDENTIAL") {
    return true;
  }

  const httpStatus = error?.status || error?.response?.status || error?.statusCode || error?.code || error?.error?.code;
  if (httpStatus === 401 || httpStatus === 403) {
    return true;
  }

  const gRpcStatus = (error?.error?.status || error?.status || "").toString().toUpperCase();
  if (gRpcStatus === "PERMISSION_DENIED" || gRpcStatus === "UNAUTHENTICATED") {
    return true;
  }

  const msg = (error?.message || String(error || "")).toLowerCase();
  return (
    msg.includes("api key not valid") ||
    msg.includes("invalid api key") ||
    msg.includes("invalid_credential") ||
    msg.includes("permission denied") ||
    msg.includes("unauthenticated") ||
    msg.includes("unauthorized")
  );
}

/**
 * Extracts Retry-After delay in milliseconds from HTTP response headers or error objects if available.
 */
export function extractRetryAfterMs(error: any): number | null {
  try {
    const header =
      error?.headers?.["retry-after"] ||
      error?.response?.headers?.get?.("retry-after") ||
      error?.response?.headers?.["retry-after"];

    if (header) {
      const parsedSeconds = parseFloat(header);
      if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
        return Math.round(parsedSeconds * 1000);
      }
      const parsedDate = Date.parse(header);
      if (!isNaN(parsedDate) && parsedDate > Date.now()) {
        return parsedDate - Date.now();
      }
    }

    // Google API metadata retryDelay
    const details = error?.error?.details || error?.details;
    if (Array.isArray(details)) {
      const retryInfo = details.find((d: any) => d?.["@type"]?.includes("RetryInfo") || d?.retryDelay);
      if (retryInfo?.retryDelay) {
        const seconds = parseFloat(retryInfo.retryDelay);
        if (!isNaN(seconds) && seconds > 0) {
          return Math.round(seconds * 1000);
        }
      }
    }
  } catch {}

  return null;
}

/**
 * Computes bounded backoff delay with exponential scaling and random jitter.
 */
export function calculateBackoffMs(
  attempt: number,
  retryAfterMs: number | null,
  baseDelayMs = 300,
  maxDelayMs = 2000,
  jitterMs = 200
): number {
  if (retryAfterMs !== null && retryAfterMs > 0) {
    return Math.min(maxDelayMs, Math.max(baseDelayMs, retryAfterMs));
  }

  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * jitterMs;
  return Math.min(maxDelayMs, exponential + jitter);
}

/**
 * Sleeps for the calculated delay unless doing so would violate the overall deadline.
 * Returns true if sleep completed, false if aborted due to impending deadline expiration.
 */
export async function sleepWithDeadline(delayMs: number, deadlineTimestamp: number): Promise<boolean> {
  const now = Date.now();
  if (now + delayMs >= deadlineTimestamp) {
    return false; // Deadline would be exceeded
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return true;
}
