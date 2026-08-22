/**
 * Sensitive Data Context Redaction Module
 */

const REDACTION_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // Credit card numbers (Luhn candidate 13-19 digits)
  {
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    replacement: "[REDACTED_CREDIT_CARD]",
  },
  // JWT tokens (3 base64url segments separated by dots)
  {
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: "[REDACTED_JWT_TOKEN]",
  },
  // Bearer / Auth header secrets
  {
    pattern: /(?:bearer|authorization|api[_-]?key|secret|token)\s*[:=]\s*["']?([A-Za-z0-9_\-\.]{12,})["']?/gi,
    replacement: "$1: [REDACTED_SECRET]",
  },
  // Passwords in text or json (password=xyz, "password": "xyz")
  {
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["']?([^\s"']+)["']?/gi,
    replacement: "password=[REDACTED_PASSWORD]",
  },
  // OTPs or Verification codes (6-digit standalone numbers with OTP label)
  {
    pattern: /(?:otp|code|verification[_-]?code)\s*[:=]?\s*["']?(\d{4,8})["']?/gi,
    replacement: "otp=[REDACTED_OTP]",
  },
  // Cookies (Cookie: session=...)
  {
    pattern: /(?:cookie|set-cookie)\s*:\s*([^\r\n]+)/gi,
    replacement: "cookie: [REDACTED_COOKIE]",
  },
];

/**
 * Scans webpage context, form contents, or memory text and redacts sensitive credentials,
 * passwords, tokens, cookies, and payment information before LLM processing.
 */
export function redactSensitiveContext(context: string | null | undefined): string {
  if (!context || typeof context !== "string") {
    return "";
  }
  let sanitized = context;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}
