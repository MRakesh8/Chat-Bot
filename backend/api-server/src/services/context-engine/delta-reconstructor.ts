/**
 * @file delta-reconstructor.ts
 * @description Reconstructs full WebsiteContext from delta payloads.
 * The widget can send either a "full" context snapshot or a "delta" containing
 * only changed segments. This module caches full snapshots per session and
 * merges deltas on top, validating sequence numbers for ordering.
 */
import { logger } from "../../lib/logger";
import type { WebsiteContext } from "./types";
import { validateWebsiteContext } from "./context-validator";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Cached session entry holding the last full context and ordering info. */
interface CachedSession {
  context: WebsiteContext;
  lastSequence: number;
  lastAccessedAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of sessions held in cache before eviction. */
const MAX_SESSIONS = 10_000;

/** Session TTL in milliseconds (30 minutes). */
const SESSION_TTL_MS = 30 * 60 * 1000;

/** Segment keys that can be individually updated via delta transport. */
const MERGEABLE_SEGMENTS = [
  "page",
  "navigation",
  "content",
  "state",
  "workflow",
  "viewport",
  "metadata",
] as const;

// ---------------------------------------------------------------------------
// DeltaReconstructor
// ---------------------------------------------------------------------------

/**
 * Maintains a per-session cache and reconstructs full `WebsiteContext` from
 * either full snapshots or delta payloads.
 */
export class DeltaReconstructor {
  private cache = new Map<string, CachedSession>();

  /**
   * Process an incoming payload (full or delta) and return the reconstructed
   * full `WebsiteContext`, or `null` if reconstruction is impossible
   * (e.g. cache miss on a delta, invalid payload).
   *
   * @param sessionId - Unique session identifier from the widget.
   * @param payload   - Raw JSON payload from the widget.
   * @returns Reconstructed `WebsiteContext` or `null`.
   */
  reconstruct(sessionId: string, payload: unknown): WebsiteContext | null {
    try {
      if (!payload || typeof payload !== "object") {
        logger.warn("delta-reconstructor: payload is not an object");
        return null;
      }

      const raw = payload as Record<string, unknown>;
      const transport = raw.transport as Record<string, unknown> | undefined;

      if (!transport || typeof transport !== "object") {
        logger.warn("delta-reconstructor: missing transport segment");
        return null;
      }

      const mode = transport.mode as string;
      const sequenceNumber = transport.sequenceNumber as number;

      // -------------------------------------------------------------------
      // FULL mode — validate, cache, and return
      // -------------------------------------------------------------------
      if (mode === "full") {
        const validated = validateWebsiteContext(payload);
        if (!validated) {
          logger.warn("delta-reconstructor: full payload failed validation");
          return null;
        }

        this.evictIfNeeded();

        this.cache.set(sessionId, {
          context: validated,
          lastSequence: sequenceNumber,
          lastAccessedAt: Date.now(),
        });

        return validated;
      }

      // -------------------------------------------------------------------
      // DELTA mode — merge changed segments into cached full context
      // -------------------------------------------------------------------
      if (mode === "delta") {
        const cached = this.cache.get(sessionId);

        if (!cached) {
          logger.info(
            { sessionId },
            "delta-reconstructor: cache miss for delta — widget should resend full",
          );
          return null;
        }

        // Validate sequence ordering
        if (
          typeof sequenceNumber === "number" &&
          sequenceNumber <= cached.lastSequence
        ) {
          logger.warn(
            { sessionId, expected: cached.lastSequence + 1, received: sequenceNumber },
            "delta-reconstructor: out-of-order or duplicate sequence",
          );
          return null;
        }

        // Merge changed segments
        const changedSegments = (transport.changedSegments as string[]) ?? [];
        const merged: Record<string, unknown> = { ...cached.context };

        for (const segment of changedSegments) {
          if (
            (MERGEABLE_SEGMENTS as readonly string[]).includes(segment) &&
            segment in raw
          ) {
            merged[segment] = raw[segment];
          }
        }

        // Update transport on the merged context
        merged.transport = raw.transport;
        merged.timestamp = raw.timestamp ?? cached.context.timestamp;
        merged.extractionDurationMs =
          raw.extractionDurationMs ?? cached.context.extractionDurationMs;

        // Validate the merged result
        const validated = validateWebsiteContext(merged);
        if (!validated) {
          logger.warn(
            { sessionId },
            "delta-reconstructor: merged context failed validation",
          );
          return null;
        }

        // Update cache
        cached.context = validated;
        cached.lastSequence = sequenceNumber;
        cached.lastAccessedAt = Date.now();

        return validated;
      }

      logger.warn({ mode }, "delta-reconstructor: unknown transport mode");
      return null;
    } catch (err) {
      logger.error({ err, sessionId }, "delta-reconstructor: reconstruction error");
      return null;
    }
  }

  /**
   * Remove expired sessions (older than 30 minutes).
   * Should be called periodically or before heavy operations.
   */
  cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [id, session] of this.cache) {
      if (now - session.lastAccessedAt > SESSION_TTL_MS) {
        this.cache.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug({ removed, remaining: this.cache.size }, "delta-reconstructor: cleanup");
    }
  }

  /**
   * Returns the current number of cached sessions.
   */
  getSessionCount(): number {
    return this.cache.size;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Evict the oldest sessions if the cache has reached capacity.
   * Uses a simple LRU-style eviction based on `lastAccessedAt`.
   */
  private evictIfNeeded(): void {
    if (this.cache.size < MAX_SESSIONS) return;

    // Find and remove the oldest 10% to avoid evicting on every insert
    const evictCount = Math.max(1, Math.floor(MAX_SESSIONS * 0.1));
    const entries = [...this.cache.entries()].sort(
      (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt,
    );

    for (let i = 0; i < evictCount && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }

    logger.debug(
      { evicted: evictCount, remaining: this.cache.size },
      "delta-reconstructor: evicted oldest sessions",
    );
  }
}
