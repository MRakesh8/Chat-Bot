import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { apiBaseUrl } from "@/lib/api-url";
import { useQueryClient } from "@tanstack/react-query";

type DbUser = {
  id: string;
  email: string;
  role: string;
  features: {
    canCreateProject: boolean;
    canUseWidgetStudio: boolean;
    canUseContextEngine: boolean;
  };
};

type AuthContextType = {
  user: User | null;
  dbUser: DbUser | null;
  session: Session | null;
  isLoading: boolean;
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
  role: "super_admin",
  features: {
    canCreateProject: true,
    canUseWidgetStudio: true,
    canUseContextEngine: true,
  },
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  dbUser: null,
  session: null,
  isLoading: true,
  signOut: async () => {},
  loginAsDemo: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loginAsDemo = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("aria_demo_session", "true");
    }
    setUser(DEMO_USER);
    setDbUser(DEMO_DB_USER);
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
      setIsLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setSession(data.session);
        setUser(data.session.user ?? null);
        fetchDbUser(data.session.access_token).finally(() => setIsLoading(false));
      } else if (!isDemo) {
        setDbUser(null);
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
            setIsLoading(false);
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
    <AuthContext.Provider value={{ user, dbUser, session, isLoading, signOut, loginAsDemo }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
