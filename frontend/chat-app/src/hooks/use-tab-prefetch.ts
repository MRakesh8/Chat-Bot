import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { apiUrl } from "@/lib/api-url";

const DEFAULT_CONTEXT_SETTINGS = {
  enabled: false,
  dashboardAnalysis: true,
  formAssistant: true,
  tableAnalysis: false,
  navigationAssistant: false,
  knowledgeComparison: false,
  mistakeDetection: false,
  contextMemory: false,
  developerDebugMode: false,
};

/**
 * Intelligent tab prefetching hook for Project Edit Workspace.
 * Automatically prefetches next likely tab data in background with staggered execution
 * and provides instant hover/focus prefetching on tab triggers.
 */
export function useProjectTabPrefetch(projectId: string | null | undefined, currentTab?: string) {
  const queryClient = useQueryClient();
  const authFetch = useAuthFetch();
  const prefetchedTabsRef = useRef<Set<string>>(new Set());

  // Reset prefetched set when projectId changes
  useEffect(() => {
    prefetchedTabsRef.current.clear();
  }, [projectId]);

  const prefetchTab = useCallback(
    async (tab: string) => {
      if (!projectId || projectId === "new") return;

      const prefetchPromises: Promise<any>[] = [];

      switch (tab) {
        case "overview":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["admin-dashboard", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/projects/${projectId}/dashboard`));
                if (!res.ok) {
                  const errJson = await res.json().catch(() => ({}));
                  throw new Error(errJson.error || `Server responded with status ${res.status}`);
                }
                return res.json();
              },
            })
          );
          break;

        case "knowledge":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["knowledge-categories", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/categories/project/${projectId}`));
                if (!res.ok) throw new Error("Failed to load categories");
                return res.json();
              },
            }),
            queryClient.prefetchQuery({
              queryKey: ["knowledge-sources", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/files/project/${projectId}`));
                if (!res.ok) throw new Error("Failed to load sources");
                return res.json();
              },
            })
          );
          break;

        case "reports":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["reports", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/reports/project/${projectId}`));
                if (!res.ok) throw new Error("Failed to load reports");
                return res.json();
              },
            })
          );
          break;

        case "website-connected":
        case "widget-studio":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["widget-settings", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/settings`));
                if (!res.ok) throw new Error("Failed to load widget settings");
                return res.json();
              },
            }),
            queryClient.prefetchQuery({
              queryKey: ["project-api-keys", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys`));
                if (!res.ok) throw new Error("Failed to load api keys");
                return res.json();
              },
            })
          );
          break;

        case "channels":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["whatsapp-connections", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/projects/${projectId}/whatsapp/connections`));
                if (!res.ok) throw new Error("Failed to load connections");
                return res.json();
              },
            }),
            queryClient.prefetchQuery({
              queryKey: ["whatsapp-settings", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/projects/${projectId}/whatsapp/settings`));
                if (!res.ok) throw new Error("Failed to load settings");
                return res.json();
              },
            })
          );
          break;

        case "deployment":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["widget-settings", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/settings`));
                if (!res.ok) throw new Error("Failed to load widget settings");
                return res.json();
              },
            }),
            queryClient.prefetchQuery({
              queryKey: ["project-api-keys", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys`));
                if (!res.ok) throw new Error("Failed to load api keys");
                return res.json();
              },
            })
          );
          break;

        case "api-keys":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["project-api-keys", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys`));
                if (!res.ok) throw new Error("Failed to load api keys");
                return res.json();
              },
            })
          );
          break;

        case "context-engine":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["context-settings", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/context-settings`));
                if (!res.ok) return DEFAULT_CONTEXT_SETTINGS;
                return res.json();
              },
            })
          );
          break;

        case "notifications":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["project-notifications", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/projects/${projectId}/notifications`));
                if (!res.ok) throw new Error("Failed to load notifications");
                return res.json();
              },
            })
          );
          break;

        case "integrations":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["project-integrations", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/projects/${projectId}/integrations`));
                if (!res.ok) throw new Error("Failed to load integrations");
                const data = await res.json();
                return (data.integrations || []) as any[];
              },
            })
          );
          break;

        case "analytics":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["widget-analytics", projectId, "7d"],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/analytics?timeframe=7d`));
                if (!res.ok) return null;
                return res.json();
              },
            })
          );
          break;

        case "billing":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["payment-status", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/payments/status/${projectId}`));
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  throw new Error(err.error || "Failed to fetch billing status");
                }
                return res.json();
              },
            })
          );
          break;

        case "agent-control":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["project-executions", projectId, "all"],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/projects/${projectId}/executions?status=all&limit=50&offset=0`));
                if (!res.ok) return { executions: [], totalCount: 0 };
                return res.json();
              },
            }),
            queryClient.prefetchQuery({
              queryKey: ["project-execution-stats", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/projects/${projectId}/executions/stats`));
                if (!res.ok) return null;
                return res.json();
              },
            }),
            queryClient.prefetchQuery({
              queryKey: ["agent-capabilities", projectId],
              queryFn: async () => {
                const res = await authFetch(apiUrl(`/api/agent/capabilities/${projectId}`));
                if (!res.ok) return { capabilities: [] };
                return res.json();
              },
            })
          );
          break;

        default:
          break;
      }

      prefetchedTabsRef.current.add(tab);
      await Promise.allSettled(prefetchPromises);
    },
    [projectId, authFetch, queryClient]
  );

  // Background staged prefetching of the most likely tabs after initial render
  useEffect(() => {
    if (!projectId || projectId === "new") return;

    // Ordered stages of prefetching to prevent request congestion and preserve network bandwidth
    // Stage 1 (150ms): Core customization tabs most frequently clicked after overview
    const timer1 = setTimeout(() => {
      const stage1Tabs = ["knowledge", "website-connected", "widget-studio", "api-keys"];
      stage1Tabs.forEach((tab) => {
        if (tab !== currentTab && !prefetchedTabsRef.current.has(tab)) {
          prefetchTab(tab);
        }
      });
    }, 150);

    // Stage 2 (400ms): Channel & Engine configurations
    const timer2 = setTimeout(() => {
      const stage2Tabs = ["context-engine", "channels", "integrations"];
      stage2Tabs.forEach((tab) => {
        if (tab !== currentTab && !prefetchedTabsRef.current.has(tab)) {
          prefetchTab(tab);
        }
      });
    }, 400);

    // Stage 3 (700ms): Deployment, Notifications, Reports, Analytics
    const timer3 = setTimeout(() => {
      const stage3Tabs = ["deployment", "notifications", "reports", "analytics"];
      stage3Tabs.forEach((tab) => {
        if (tab !== currentTab && !prefetchedTabsRef.current.has(tab)) {
          prefetchTab(tab);
        }
      });
    }, 700);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [projectId, currentTab, prefetchTab]);

  const getTabTriggerProps = useCallback(
    (tab: string) => ({
      onMouseEnter: () => prefetchTab(tab),
      onFocus: () => prefetchTab(tab),
      onTouchStart: () => prefetchTab(tab),
    }),
    [prefetchTab]
  );

  return {
    prefetchTab,
    getTabTriggerProps,
  };
}

/**
 * Intelligent tab prefetching hook for Workspace Settings Page.
 */
export function useSettingsTabPrefetch(effectiveProjectId: string | null | undefined, currentTab?: string) {
  const queryClient = useQueryClient();
  const authFetch = useAuthFetch();
  const prefetchedTabsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    prefetchedTabsRef.current.clear();
  }, [effectiveProjectId]);

  const prefetchTab = useCallback(
    async (tab: string) => {
      const prefetchPromises: Promise<any>[] = [];

      switch (tab) {
        case "notifications":
          if (effectiveProjectId) {
            prefetchPromises.push(
              queryClient.prefetchQuery({
                queryKey: ["project-notifications", effectiveProjectId],
                queryFn: async () => {
                  const res = await authFetch(apiUrl(`/api/projects/${effectiveProjectId}/notifications`));
                  if (!res.ok) throw new Error("Failed to load notifications");
                  return res.json();
                },
              })
            );
          }
          break;

        case "billing":
          if (effectiveProjectId) {
            prefetchPromises.push(
              queryClient.prefetchQuery({
                queryKey: ["payment-status", effectiveProjectId],
                queryFn: async () => {
                  const res = await authFetch(apiUrl(`/api/payments/status/${effectiveProjectId}`));
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || "Failed to fetch billing status");
                  }
                  return res.json();
                },
              })
            );
          }
          break;

        default:
          break;
      }

      prefetchedTabsRef.current.add(tab);
      await Promise.allSettled(prefetchPromises);
    },
    [effectiveProjectId, authFetch, queryClient]
  );

  useEffect(() => {
    if (!effectiveProjectId) return;

    const timer = setTimeout(() => {
      ["billing"].forEach((tab) => {
        if (tab !== currentTab && !prefetchedTabsRef.current.has(tab)) {
          prefetchTab(tab);
        }
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [effectiveProjectId, currentTab, prefetchTab]);

  const getTabTriggerProps = useCallback(
    (tab: string) => ({
      onMouseEnter: () => prefetchTab(tab),
      onFocus: () => prefetchTab(tab),
      onTouchStart: () => prefetchTab(tab),
    }),
    [prefetchTab]
  );

  return {
    prefetchTab,
    getTabTriggerProps,
  };
}

/**
 * Intelligent tab prefetching hook for Super Admin Clarity Panel.
 */
export function useAdminClarityTabPrefetch(isAdmin: boolean, currentTab?: string) {
  const queryClient = useQueryClient();
  const authFetch = useAuthFetch();
  const prefetchedTabsRef = useRef<Set<string>>(new Set());

  const prefetchTab = useCallback(
    async (tab: string) => {
      if (!isAdmin) return;

      const prefetchPromises: Promise<any>[] = [];

      switch (tab) {
        case "users":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["super-admin-users"],
              queryFn: async () => {
                const res = await authFetch(apiUrl("/api/super-admin/users"));
                if (!res.ok) throw new Error("Failed to load users");
                return res.json();
              },
            })
          );
          break;

        case "projects":
        case "subscriptions":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["super-admin-subscriptions"],
              queryFn: async () => {
                const res = await authFetch(apiUrl("/api/super-admin/subscriptions"));
                if (!res.ok) throw new Error("Failed to load subscriptions");
                return res.json();
              },
            })
          );
          break;

        case "settings":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["super-admin-global-settings"],
              queryFn: async () => {
                const res = await authFetch(apiUrl("/api/super-admin/global-settings"));
                if (!res.ok) throw new Error("Failed to load global settings");
                return res.json();
              },
            })
          );
          break;

        case "payments":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["super-admin-payments"],
              queryFn: async () => {
                const res = await authFetch(apiUrl("/api/super-admin/payments"));
                if (!res.ok) throw new Error("Failed to load payments");
                return res.json();
              },
            })
          );
          break;

        case "supabase":
          prefetchPromises.push(
            queryClient.prefetchQuery({
              queryKey: ["super-admin-supabase"],
              queryFn: async () => {
                const res = await authFetch(apiUrl("/api/super-admin/supabase-stats"));
                if (!res.ok) throw new Error("Failed to load supabase stats");
                return res.json();
              },
            })
          );
          break;

        default:
          break;
      }

      prefetchedTabsRef.current.add(tab);
      await Promise.allSettled(prefetchPromises);
    },
    [isAdmin, authFetch, queryClient]
  );

  useEffect(() => {
    if (!isAdmin) return;

    const timer = setTimeout(() => {
      ["subscriptions", "settings", "payments"].forEach((tab) => {
        if (tab !== currentTab && !prefetchedTabsRef.current.has(tab)) {
          prefetchTab(tab);
        }
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [isAdmin, currentTab, prefetchTab]);

  const getTabTriggerProps = useCallback(
    (tab: string) => ({
      onMouseEnter: () => prefetchTab(tab),
      onFocus: () => prefetchTab(tab),
      onTouchStart: () => prefetchTab(tab),
    }),
    [prefetchTab]
  );

  return {
    prefetchTab,
    getTabTriggerProps,
  };
}
