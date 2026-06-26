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
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  dbUser: null,
  session: null,
  isLoading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.access_token) {
        fetchDbUser(session.access_token).finally(() => setIsLoading(false));
      } else {
        setDbUser(null);
        setIsLoading(false);
        queryClient.clear(); // Ensure cache is clear if initially unauthenticated
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.access_token) {
          fetchDbUser(session.access_token).finally(() => setIsLoading(false));
        } else {
          setDbUser(null);
          setIsLoading(false);
          queryClient.clear(); // Clear cache when auth state changes to logged out
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    queryClient.clear();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, dbUser, session, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
