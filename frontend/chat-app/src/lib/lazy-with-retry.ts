import { lazy, ComponentType } from "react";

/**
 * Checks if an error is indicative of a dynamic module / chunk load failure.
 * This happens when:
 * 1. A new deployment removed previous hashed chunks.
 * 2. Transient network drop or offline condition during navigation.
 * 3. The server responded with HTML (e.g. Vercel SPA rewrite fallback) instead of JS.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("loading chunk") ||
    message.includes("loading css chunk") ||
    message.includes("unexpected token '<'") ||
    message.includes("mime type") ||
    message.includes("dynamically imported module")
  );
}

const CHUNK_RELOAD_KEY_PREFIX = "nova_chunk_reloaded_";

/**
 * Marks that a chunk reload has been attempted for a given route/module
 * to prevent infinite reload loops.
 */
export function hasReloadedForPath(pathKey: string): boolean {
  if (typeof window === "undefined" || !window.sessionStorage) return false;
  try {
    return window.sessionStorage.getItem(`${CHUNK_RELOAD_KEY_PREFIX}${pathKey}`) === "true";
  } catch {
    return false;
  }
}

export function setReloadedForPath(pathKey: string): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(`${CHUNK_RELOAD_KEY_PREFIX}${pathKey}`, "true");
  } catch {
    // Ignore storage quota / access issues
  }
}

export function clearReloadFlagForPath(pathKey: string): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(`${CHUNK_RELOAD_KEY_PREFIX}${pathKey}`);
  } catch {
    // Ignore
  }
}

export interface LazyWithRetryOptions {
  /** Maximum retry attempts for transient network errors before falling back (default: 2) */
  maxRetries?: number;
  /** Initial delay between retries in milliseconds (default: 350ms) */
  retryDelayMs?: number;
  /** Unique key or route identifier for session reload guard (defaults to pathname) */
  key?: string;
}

/**
 * Resilient lazy loader for React components.
 * 
 * Features:
 * 1. Retries transient dynamic import failures with exponential backoff.
 * 2. If failure is a confirmed chunk error (e.g. deployment version mismatch),
 *    triggers a safe single page reload to fetch the latest index.html and modern chunks.
 * 3. Prevents infinite reload loops via sessionStorage guard.
 * 4. Propagates the error to RouteErrorBoundary if reload already occurred or cannot resolve.
 */
/**
 * Detects whether the user is currently editing an input or textarea
 * to prevent silent automatic reloads from discarding active unsaved input.
 */
export function hasUnsavedWork(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.getAttribute("contenteditable") === "true")) {
      const val = (activeEl as HTMLInputElement | HTMLTextAreaElement).value;
      if (val && val.trim().length > 0) return true;
    }
  } catch {}
  return false;
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  options: LazyWithRetryOptions = {}
): React.LazyExoticComponent<T> {
  const { maxRetries = 2, retryDelayMs = 350, key } = options;

  return lazy(async () => {
    let lastError: unknown;
    const pathKey = key || (typeof window !== "undefined" ? window.location.pathname : "unknown");

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const module = await importer();
        // Clear reload flag on successful load so future deployments can reload if needed
        clearReloadFlagForPath(pathKey);
        return module;
      } catch (err) {
        lastError = err;
        console.warn(`[NOVA Navigation] Dynamic module load attempt ${attempt + 1}/${maxRetries + 1} failed for "${pathKey}":`, err);

        // If not the final attempt, wait with exponential backoff before retrying
        if (attempt < maxRetries) {
          const delay = retryDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All immediate retries failed. Inspect error.
    if (isChunkLoadError(lastError) && typeof window !== "undefined") {
      const alreadyReloaded = hasReloadedForPath(pathKey);
      if (!alreadyReloaded) {
        if (hasUnsavedWork()) {
          console.info(`[NOVA Navigation] Active unsaved user input detected on "${pathKey}". Suppressing automatic reload to preserve work; presenting recovery UI.`);
        } else {
          console.info(`[NOVA Navigation] Outdated or missing chunk detected for "${pathKey}". Performing safe version recovery reload...`);
          setReloadedForPath(pathKey);
          window.location.reload();
          // Return a pending promise while the browser reloads
          return new Promise<{ default: T }>(() => {});
        }
      } else {
        console.error(`[NOVA Navigation] Chunk load failed after reload for "${pathKey}". Delegating to error boundary.`);
      }
    }

    // Re-throw so RouteErrorBoundary can render a recoverable error UI
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  });
}
