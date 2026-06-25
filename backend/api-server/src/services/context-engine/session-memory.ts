/**
 * @file session-memory.ts
 * @description In-memory session state manager for the Website Context Engine.
 * Tracks page history, workflow, and tab selections per visitor session.
 */
import type { SessionMemory, WebsiteContext } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum concurrent sessions cached. */
const MAX_SESSIONS = 10_000;

/** Session TTL in milliseconds (30 minutes). */
const SESSION_TTL_MS = 30 * 60 * 1_000;

/** Maximum number of pages kept in history. */
const MAX_PAGE_HISTORY = 10;

/** Cleanup interval (5 minutes). */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Session Memory Store
// ---------------------------------------------------------------------------

export class SessionMemoryStore {
  private sessions = new Map<string, SessionMemory>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    // Allow the timer to not prevent Node from exiting
    if (this.cleanupTimer && typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Returns the session for the given ID, creating a new one if it doesn't exist.
   */
  getOrCreate(sessionId: string): SessionMemory {
    let session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = Date.now();
      return session;
    }

    // Evict oldest session if at capacity
    if (this.sessions.size >= MAX_SESSIONS) {
      this.evictOldest();
    }

    session = {
      sessionId,
      currentPage: "",
      previousPage: null,
      pageHistory: [],
      selectedFilters: {},
      openDialogs: [],
      recentActions: [],
      conversationTurns: 0,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Updates the session with the latest website context.
   * Tracks page navigation, tab selections, workflow, and dialog state.
   */
  update(sessionId: string, context: WebsiteContext): SessionMemory {
    const session = this.getOrCreate(sessionId);

    // ── Page tracking ──
    const newPage = context.page?.path || context.page?.url || "";
    if (newPage && newPage !== session.currentPage) {
      session.previousPage = session.currentPage || null;
      session.currentPage = newPage;

      // Add to history (dedup, keep last N)
      if (!session.pageHistory.includes(newPage)) {
        session.pageHistory.push(newPage);
        if (session.pageHistory.length > MAX_PAGE_HISTORY) {
          session.pageHistory.shift();
        }
      }
    }

    // ── Tab tracking ──
    if (context.state?.selectedTab) {
      session.selectedTab = context.state.selectedTab;
    }

    // ── Workflow tracking ──
    if (context.workflow?.detectedWorkflowType) {
      session.currentWorkflow = context.workflow.detectedWorkflowType;
    }

    // ── Dialog tracking ──
    if (context.state?.openDialogs) {
      session.openDialogs = context.state.openDialogs;
    }

    // ── Filters ──
    if (context.state?.activeFilters?.length) {
      session.selectedFilters = {};
      for (const f of context.state.activeFilters) {
        session.selectedFilters[f.field] = f.value;
      }
    }

    // ── Increment conversation turns ──
    session.conversationTurns += 1;
    session.lastActivityAt = Date.now();

    return session;
  }

  /**
   * Removes expired sessions (older than TTL).
   */
  cleanup(): void {
    const now = Date.now();
    const cutoff = now - SESSION_TTL_MS;

    for (const [id, session] of this.sessions) {
      if (session.lastActivityAt < cutoff) {
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Returns the number of active sessions.
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Destroys the store and stops the cleanup timer.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /** Evicts the session with the oldest `lastActivityAt` timestamp. */
  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, session] of this.sessions) {
      if (session.lastActivityAt < oldestTime) {
        oldestTime = session.lastActivityAt;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.sessions.delete(oldestId);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const sessionMemoryStore = new SessionMemoryStore();
