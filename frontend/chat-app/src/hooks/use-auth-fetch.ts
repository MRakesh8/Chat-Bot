import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

// Shared in-flight token refresh promise across all concurrent requests
let activeRefreshPromise: Promise<string | null> | null = null;

async function getSharedRefreshedToken(): Promise<string | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data?.session?.access_token) {
        return data.session.access_token;
      }
      return null;
    } catch {
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

export function useAuthFetch() {
  const { session, activeOrganizationId } = useAuth();
  
  return async (url: string, options: RequestInit = {}) => {
    // 1. Resolve access token: prefer React context state, or fetch from supabase if missing
    let token = session?.access_token;
    if (!token) {
      try {
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token;
      } catch {}
    }

    // 2. Resolve organization context: prefer React context, fallback to localStorage
    let orgId = activeOrganizationId;
    if (!orgId && typeof window !== "undefined") {
      orgId = localStorage.getItem("aria_active_organization_id");
    }
    
    const buildHeaders = (authToken?: string | null) => {
      const headers: Record<string, string> = {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(orgId ? { "x-organization-id": orgId } : {}),
      };
      
      if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
      }
      return {
        ...headers,
        ...(options.headers as Record<string, string> ?? {}),
      };
    };

    // 3. Request execution with bounded default timeout if caller didn't pass one
    let timeoutId: any;
    let signal = options.signal;
    const timeoutDuration = typeof (options as any)?.timeoutMs === "number"
      ? (options as any).timeoutMs
      : 25000;

    if (!signal && timeoutDuration > 0 && typeof AbortController !== "undefined") {
      const controller = new AbortController();
      timeoutId = setTimeout(() => {
        controller.abort(new DOMException(`Request timed out after ${timeoutDuration}ms`, "TimeoutError"));
      }, timeoutDuration);
      signal = controller.signal;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        signal,
        credentials: "include",
        headers: buildHeaders(token),
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    // 4. Self-healing token refresh on 401 Unauthorized (deduplicated across concurrent requests)
    if (res.status === 401 && !url.includes("/api/system/me")) {
      // Never reuse an already-aborted signal for retries
      if (options.signal?.aborted) {
        return res;
      }
      try {
        const freshToken = await getSharedRefreshedToken();
        if (freshToken) {
          if (options.signal?.aborted) {
            return res;
          }
          let retryTimeoutId: any;
          let retrySignal = options.signal;
          if (!retrySignal && timeoutDuration > 0 && typeof AbortController !== "undefined") {
            const controller = new AbortController();
            retryTimeoutId = setTimeout(() => {
              controller.abort(new DOMException(`Retry request timed out after ${timeoutDuration}ms`, "TimeoutError"));
            }, timeoutDuration);
            retrySignal = controller.signal;
          }

          try {
            res = await fetch(url, {
              ...options,
              signal: retrySignal,
              credentials: "include",
              headers: buildHeaders(freshToken),
            });
          } finally {
            if (retryTimeoutId) clearTimeout(retryTimeoutId);
          }
        }
      } catch {
        // Fallback to original response on refresh error
      }
    }

    return res;
  };
}
