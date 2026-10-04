import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

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
    
    let res = await fetch(url, {
      ...options,
      credentials: "include",
      headers: buildHeaders(token),
    });

    // 3. Self-healing token refresh on 401 Unauthorized
    if (res.status === 401 && !url.includes("/api/system/me")) {
      try {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        if (!refreshErr && refreshData?.session?.access_token) {
          const freshToken = refreshData.session.access_token;
          res = await fetch(url, {
            ...options,
            credentials: "include",
            headers: buildHeaders(freshToken),
          });
        }
      } catch (e) {
        // Fallback to original response on refresh error
      }
    }

    return res;
  };
}
