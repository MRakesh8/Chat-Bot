import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!rawSupabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase env vars");
}

export const supabaseUrl = rawSupabaseUrl;

export const supabase = createClient(rawSupabaseUrl, supabaseAnonKey, {
  auth: {
    storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
    flowType: "pkce",
  },
});

export const createProxySupabaseClient = (originUrl: string) => {
  const proxyUrl = `${originUrl}/supabase-proxy`;
  return createClient(proxyUrl, supabaseAnonKey, {
    auth: {
      storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
      flowType: "pkce",
    },
  });
};
