import { createContext, useContext, useEffect, useState, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { apiBaseUrl } from "@/lib/api-url";
import { useQueryClient } from "@tanstack/react-query";
import { clearAllContinuityState } from "@/lib/workspace-continuity";

type DbUser = {
  id: string;
  email: string;
  role: string;
  features: {
    canCreateProject: boolean;
    canUseWidgetStudio: boolean;
    canUseContextEngine: boolean;
  };
  memberships?: { organizationId: string; role: string }[];
};

type AuthContextType = {
  user: User | null;
  dbUser: DbUser | null;
  session: Session | null;
  isLoading: boolean;
  activeOrganizationId: string | null;
  setActiveOrganizationId: (id: string) => void;
  signOut: () => Promise<void>;
  loginAsDemo: () => void;
  refreshDbUser: () => Promise<void>;
};

const DEMO_USER: User = {
  id: "00000000-0000-4000-8000-000000000001",
  app_metadata: {},
  user_metadata: { full_name: "Demo User", avatar_url: "" },
  aud: "authenticated",
  created_at: new Date().toISOString(),
  email: "demo@example.com",
  role: "authenticated",
  updated_at: new Date().toISOString(),
};

const DEMO_DB_USER: DbUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.com",
  role: "user",
  features: {
    canCreateProject: true,
    canUseWidgetStudio: true,
    canUseContextEngine: true,
  },
  memberships: [{ organizationId: "5e6c4459-93c8-40a0-9fb2-9e9927b77ba9", role: "owner" }]
};

const DEMO_SESSION: Session = {
  access_token: "local-demo-token",
  token_type: "bearer",
  expires_in: 3600,
  refresh_token: "demo-refresh-token",
  user: DEMO_USER,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  dbUser: null,
  session: null,
  isLoading: true,
  activeOrganizationId: null,
  setActiveOrganizationId: () => {},
  signOut: async () => {},
  loginAsDemo: () => {},
  refreshDbUser: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeOrganizationId, setActiveOrgId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("aria_active_organization_id");
    }
    return null;
  });

  const setActiveOrganizationId = (id: string) => {
    setActiveOrgId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("aria_active_organization_id", id);
    }
  };

  const loginAsDemo = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("aria_demo_session", "true");
    }
    setUser(DEMO_USER);
    setDbUser(DEMO_DB_USER);
    setSession(DEMO_SESSION);
    setActiveOrganizationId(DEMO_DB_USER.memberships![0].organizationId);
    setIsLoading(false);
  };

  const inFlightFetchDbUserRef = useRef<Promise<void> | null>(null);
  const retryTimeoutRef = useRef<any>(null);

  const fetchDbUser = async (accessToken: string, isBackgroundRetry = false) => {
    if (inFlightFetchDbUserRef.current) {
      return inFlightFetchDbUserRef.current;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second bounded timeout

    const fetchPromise = (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/system/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });

        if (res.ok) {
          const data = await res.json();
          setDbUser(data);
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
          }
          
          // Ensure active organization is set
          if (data.memberships && data.memberships.length > 0) {
            const stored = typeof window !== "undefined" ? localStorage.getItem("aria_active_organization_id") : null;
            const valid = stored && data.memberships.some((m: any) => m.organizationId === stored);
            if (valid) {
              setActiveOrgId(stored);
            } else {
              setActiveOrganizationId(data.memberships[0].organizationId);
            }
          }
        } else if (res.status === 401 || res.status === 403) {
          // Explicit authorization / session failure: clear dbUser
          setDbUser(null);
        } else {
          // Transient 502/503/504 backend cold-start: preserve existing dbUser and schedule background recovery
          console.warn(`[NOVA Auth] /api/system/me returned status ${res.status} (backend cold start). Scheduling background retry.`);
          if (!isBackgroundRetry) {
            retryTimeoutRef.current = setTimeout(() => {
              fetchDbUser(accessToken, true);
            }, 3500);
          }
        }
      } catch (err: any) {
        // Network timeout / AbortError or connection drop
        const isAbort = err?.name === "AbortError";
        console.warn(`[NOVA Auth] /api/system/me ${isAbort ? "timed out (cold start)" : "encountered network glitch"}. Scheduling background retry.`);
        if (!isBackgroundRetry) {
          retryTimeoutRef.current = setTimeout(() => {
            fetchDbUser(accessToken, true);
          }, 4000);
        }
      } finally {
        clearTimeout(timeoutId);
        inFlightFetchDbUserRef.current = null;
      }
    })();

    inFlightFetchDbUserRef.current = fetchPromise;
    return fetchPromise;
  };

  const refreshDbUser = async () => {
    if (session?.access_token) {
      await fetchDbUser(session.access_token);
    }
  };

  useEffect(() => {
    setBaseUrl(apiBaseUrl);
    setAuthTokenGetter(async () => {
      try {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
      } catch {
        return null;
      }
    });

    const isDemo = typeof window !== "undefined" && sessionStorage.getItem("aria_demo_session") === "true";
    if (isDemo) {
      setUser(DEMO_USER);
      setDbUser(DEMO_DB_USER);
      setSession(DEMO_SESSION);
      setActiveOrgId(DEMO_DB_USER.memberships![0].organizationId);
      setIsLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setSession(data.session);
        setUser(data.session.user ?? null);
        fetchDbUser(data.session.access_token).finally(() => setIsLoading(false));
      } else if (!isDemo) {
        setDbUser(null);
        setActiveOrgId(null);
        setIsLoading(false);
        queryClient.clear();
      }
    }).catch(() => {
      if (!isDemo) {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("aria_demo_session");
          }
          setSession(session);
          setUser(session.user ?? null);
          fetchDbUser(session.access_token).finally(() => setIsLoading(false));
        } else {
          const checkDemo = typeof window !== "undefined" && sessionStorage.getItem("aria_demo_session") === "true";
          if (!checkDemo) {
            setSession(null);
            setUser(null);
            setDbUser(null);
            setActiveOrgId(null);
            setIsLoading(false);
            clearAllContinuityState();
            queryClient.clear();
          }
        }
      }
    );

    return () => {
      subscription.unsubscribe();
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  // Background recovery on tab focus or network reconnection if dbUser was pending from cold-start
  useEffect(() => {
    const handleRecheck = () => {
      if (session?.access_token && !dbUser && !inFlightFetchDbUserRef.current) {
        fetchDbUser(session.access_token, true);
      }
    };

    window.addEventListener("focus", handleRecheck);
    window.addEventListener("online", handleRecheck);
    return () => {
      window.removeEventListener("focus", handleRecheck);
      window.removeEventListener("online", handleRecheck);
    };
  }, [session, dbUser]);

  const signOut = async () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("aria_demo_session");
    }
    clearAllContinuityState();
    queryClient.clear();
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore network errors during signout
    }
    setUser(null);
    setDbUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, dbUser, session, isLoading, activeOrganizationId, setActiveOrganizationId, signOut, loginAsDemo, refreshDbUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
