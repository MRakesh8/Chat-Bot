import { createContext, useContext, useEffect, useState } from "react";
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
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeOrganizationId, setActiveOrgId] = useState<string | null>(null);

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

  const fetchDbUser = async (accessToken: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/system/me`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDbUser(data);
        
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
      } else {
        setDbUser(null);
      }
    } catch (err) {
      setDbUser(null);
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

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
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
    <AuthContext.Provider value={{ user, dbUser, session, isLoading, activeOrganizationId, setActiveOrganizationId, signOut, loginAsDemo }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
