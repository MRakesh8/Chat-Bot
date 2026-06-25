/**
 * @file context-validator.ts
 * @description Validates and sanitises incoming WebsiteContext payloads from the
 * embeddable widget. Uses manual checks (no Zod) to keep the service lightweight.
 */
import { logger } from "../../lib/logger";
import type { WebsiteContext } from "./types";

// ---------------------------------------------------------------------------
// Sensitive-data patterns (compiled once)
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: "password", regex: /(?:password|passwd|pwd)\s*[:=]\s*\S+/gi },
  { label: "bearer-token", regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi },
  { label: "api-key", regex: /(?:api[_-]?key|apikey)\s*[:=]\s*\S+/gi },
  { label: "credit-card", regex: /\b(?:\d[ -]*?){13,19}\b/g },
  { label: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: "jwt", regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { label: "secret", regex: /(?:secret|token|auth)\s*[:=]\s*["']?\S+/gi },
];

/** Default maximum payload size in bytes (6 KiB). */
const DEFAULT_MAX_SIZE_BYTES = 6144;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && !Number.isNaN(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

/**
 * Recursively walk an object/array and redact any string values that match
 * sensitive data patterns. Returns a new structure (does not mutate input).
 */
function sanitise(value: unknown): unknown {
  if (isString(value)) {
    let sanitised = value;
    for (const { regex, label } of SENSITIVE_PATTERNS) {
      // Reset lastIndex for global regexes
      regex.lastIndex = 0;
      if (regex.test(sanitised)) {
        regex.lastIndex = 0;
        sanitised = sanitised.replace(regex, `[REDACTED:${label}]`);
      }
    }
    return sanitised;
  }

  if (isArray(value)) {
    return value.map(sanitise);
  }

  if (isObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitise(v);
    }
    return out;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Structural validation helpers
// ---------------------------------------------------------------------------

/** Validate the top-level transport segment. */
function isValidTransport(t: unknown): boolean {
  if (!isObject(t)) return false;
  if (t.mode !== "full" && t.mode !== "delta") return false;
  if (!isString(t.sessionHash)) return false;
  if (!isObject(t.segmentHashes)) return false;
  if (!isArray(t.changedSegments)) return false;
  if (!isArray(t.unchangedSegments)) return false;
  if (!isNumber(t.sequenceNumber)) return false;
  return true;
}

/** Validate basic page context. */
function isValidPage(p: unknown): boolean {
  if (!isObject(p)) return false;
  if (!isString(p.url)) return false;
  if (!isString(p.path)) return false;
  if (!isString(p.title)) return false;
  if (!isString(p.type)) return false;
  if (!isArray(p.breadcrumbs)) return false;
  if (!isString(p.heading)) return false;
  return true;
}

/** Validate navigation context. */
function isValidNavigation(n: unknown): boolean {
  if (!isObject(n)) return false;
  if (!isArray(n.items)) return false;
  return true;
}

/** Validate content context (just checks the container is an object with arrays). */
function isValidContent(c: unknown): boolean {
  if (!isObject(c)) return false;
  const requiredArrays = [
    "headings", "cards", "tables", "forms", "charts",
    "lists", "notifications", "dialogs", "buttons", "stats",
  ];
  for (const key of requiredArrays) {
    if (!isArray(c[key])) return false;
  }
  if (!isArray(c.canvasElements)) return false;
  return true;
}

/** Validate interaction state. */
function isValidState(s: unknown): boolean {
  if (!isObject(s)) return false;
  if (!isArray(s.activeFilters)) return false;
  if (!isArray(s.openDialogs)) return false;
  if (!isArray(s.visibleErrors)) return false;
  if (!isArray(s.visibleWarnings)) return false;
  if (!isString(s.scrollPosition)) return false;
  if (!isNumber(s.idleTimeMs)) return false;
  return true;
}

/** Validate workflow context (all fields optional). */
function isValidWorkflow(w: unknown): boolean {
  return isObject(w);
}

/** Validate viewport context. */
function isValidViewport(v: unknown): boolean {
  if (!isObject(v)) return false;
  if (!isNumber(v.width)) return false;
  if (!isNumber(v.height)) return false;
  if (!isNumber(v.scrollX)) return false;
  if (!isNumber(v.scrollY)) return false;
  if (!isNumber(v.scrollDepthPercent)) return false;
  if (!isNumber(v.visibleElementCount)) return false;
  if (!isNumber(v.totalElementCount)) return false;
  if (!isNumber(v.viewportCoveragePercent)) return false;
  return true;
}

/** Validate extraction metadata. */
function isValidMetadata(m: unknown): boolean {
  if (!isObject(m)) return false;
  if (!isString(m.framework)) return false;
  if (!isBoolean(m.spaDetected)) return false;
  if (!isNumber(m.domNodeCount)) return false;
  if (!isNumber(m.viewportNodeCount)) return false;
  if (!isNumber(m.extractedElementCount)) return false;
  if (!isBoolean(m.cacheHit)) return false;
  if (!isNumber(m.mutationsSinceLastExtraction)) return false;
  if (!isNumber(m.compressionRatio)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates an incoming widget payload and returns a sanitised `WebsiteContext`,
 * or `null` if the payload is invalid or exceeds the size limit.
 *
 * @param payload  - The raw JSON body from the widget request.
 * @param maxSize  - Maximum allowed payload size in bytes (default 6144).
 * @returns A validated and sanitised `WebsiteContext`, or `null`.
 */
export function validateWebsiteContext(
  payload: unknown,
  maxSize: number = DEFAULT_MAX_SIZE_BYTES,
): WebsiteContext | null {
  try {
    // -----------------------------------------------------------------------
    // 1. Basic type & size checks
    // -----------------------------------------------------------------------
    if (!isObject(payload)) {
      logger.warn("context-validator: payload is not an object");
      return null;
    }

    const raw = JSON.stringify(payload);
    if (raw.length > maxSize) {
      logger.warn(
        { size: raw.length, maxSize },
        "context-validator: payload exceeds max size",
      );
      return null;
    }

    // -----------------------------------------------------------------------
    // 2. Version gate
    // -----------------------------------------------------------------------
    if (payload.version !== "2.0") {
      logger.warn(
        { version: payload.version },
        "context-validator: unsupported version",
      );
      return null;
    }

    // -----------------------------------------------------------------------
    // 3. Required top-level scalars
    // -----------------------------------------------------------------------
    if (!isNumber(payload.timestamp)) {
      logger.warn("context-validator: missing or invalid timestamp");
      return null;
    }
    if (!isNumber(payload.extractionDurationMs)) {
      logger.warn("context-validator: missing or invalid extractionDurationMs");
      return null;
    }

    // -----------------------------------------------------------------------
    // 4. Segment validation
    // -----------------------------------------------------------------------
    if (!isValidTransport(payload.transport)) {
      logger.warn("context-validator: invalid transport segment");
      return null;
    }
    if (!isValidPage(payload.page)) {
      logger.warn("context-validator: invalid page segment");
      return null;
    }
    if (!isValidNavigation(payload.navigation)) {
      logger.warn("context-validator: invalid navigation segment");
      return null;
    }
    if (!isValidContent(payload.content)) {
      logger.warn("context-validator: invalid content segment");
      return null;
    }
    if (!isValidState(payload.state)) {
      logger.warn("context-validator: invalid state segment");
      return null;
    }
    if (!isValidWorkflow(payload.workflow)) {
      logger.warn("context-validator: invalid workflow segment");
      return null;
    }
    if (!isValidViewport(payload.viewport)) {
      logger.warn("context-validator: invalid viewport segment");
      return null;
    }
    if (!isValidMetadata(payload.metadata)) {
      logger.warn("context-validator: invalid metadata segment");
      return null;
    }

    // -----------------------------------------------------------------------
    // 5. Sanitise sensitive data
    // -----------------------------------------------------------------------
    const sanitised = sanitise(payload) as WebsiteContext;

    return sanitised;
  } catch (err) {
    logger.error({ err }, "context-validator: unexpected validation error");
    return null;
  }
}
