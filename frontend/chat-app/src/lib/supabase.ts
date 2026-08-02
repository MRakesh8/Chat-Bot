import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!rawSupabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase env vars");
}

export const supabaseUrl = rawSupabaseUrl;

export const supabase = createClient(rawSupabaseUrl, supabaseAnonKey, {
  auth: {
    // Use localStorage (not sessionStorage) for PKCE OAuth flows.
    // sessionStorage can be unreliable across OAuth redirects (browser navigates
    // away to Google and back), causing the PKCE code_verifier to be lost,
    // which results in 400/422 errors on /auth/v1/token?grant_type=pkce.
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    flowType: "pkce",
  },
});

export const createProxySupabaseClient = (originUrl: string) => {
  const proxyUrl = `${originUrl}/supabase-proxy`;
  return createClient(proxyUrl, supabaseAnonKey, {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      flowType: "pkce",
    },
  });
};
