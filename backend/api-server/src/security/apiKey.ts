/**
 * API Key Protection & Log Sanitization Module
 */

/**
 * Mask an API key so that only a short prefix and suffix are visible.
 * Example: "AIzaSyExampleSecretKey123456" -> "AIza...3456"
 */
export function maskApiKey(apiKey: string | null | undefined): string {
  if (!apiKey || typeof apiKey !== "string") {
    return "";
  }
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return "****";
  }
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}...${suffix}`;
}

const SENSITIVE_KEY_PATTERNS = [
  /api[_-]?key/i,
  /auth(orization)?/i,
  /password/i,
  /token/i,
  /secret/i,
  /cookie/i,
  /jwt/i,
  /bearer/i,
  /otp/i,
  /private[_-]?key/i,
];

/**
 * Recursively sanitizes any object or data structure for safe security event logging.
 * Replaces values of sensitive keys with "[REDACTED]".
 */
export function sanitizeForLogging<T>(obj: T, depth = 0): T {
  if (depth > 8 || obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    if (obj.toLowerCase().startsWith("bearer ")) {
      return `Bearer ${maskApiKey(obj.slice(7))}` as unknown as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLogging(item, depth + 1)) as unknown as T;
  }

  if (typeof obj === "object") {
    const sanitized: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitive) {
        if (typeof val === "string") {
          sanitized[key] = maskApiKey(val) || "[REDACTED]";
        } else {
          sanitized[key] = "[REDACTED]";
        }
      } else {
        sanitized[key] = sanitizeForLogging(val, depth + 1);
      }
    }
    return sanitized as T;
  }

  return obj;
}
