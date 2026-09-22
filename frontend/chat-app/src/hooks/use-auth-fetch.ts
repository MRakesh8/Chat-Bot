import { useAuth } from "../contexts/AuthContext";

export function useAuthFetch() {
  const { session, activeOrganizationId } = useAuth();
  
  return async (url: string, options: RequestInit = {}) => {
    const token = session?.access_token;
    
    const headers: Record<string, string> = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(activeOrganizationId ? { "x-organization-id": activeOrganizationId } : {}),
    };
    
    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    
    return fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        ...headers,
        ...(options.headers as Record<string, string> ?? {}),
      },
    });
  };
}
