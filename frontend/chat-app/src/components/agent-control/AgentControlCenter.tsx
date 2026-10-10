import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { apiUrl } from "@/lib/api-url";
import {
  Activity,
  Cpu,
  Layers,
  ShieldCheck,
  Zap,
  Lock,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Play,
  Radio,
  Clock,
  ExternalLink,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import {
  AgentCapability,
  AgentExecutionRun,
  ConfirmationState,
  StreamConnectionState,
} from "./types";
import { AgentExecutionOverview } from "./AgentExecutionOverview";
import { AgentRunHistory } from "./AgentRunHistory";
import { AgentCapabilitiesManager } from "./AgentCapabilitiesManager";
import { AgentExecutionTimeline } from "./AgentExecutionTimeline";
import { AgentToolRunnerModal } from "./AgentToolRunnerModal";
import { ActionConfirmationModal } from "./ActionConfirmationModal";

export interface AgentControlCenterProps {
  projectId: string;
  onSelectTab?: (tab: string) => void;
}

export function AgentControlCenter({ projectId, onSelectTab }: AgentControlCenterProps) {
  const { dbUser } = useAuth();
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"overview" | "runs" | "capabilities" | "policy">("overview");
  const [streamStatus, setStreamStatus] = useState<StreamConnectionState>("polling");
  const [realtimeRuns, setRealtimeRuns] = useState<AgentExecutionRun[]>([]);

  // Modals state
  const [selectedRunForTimeline, setSelectedRunForTimeline] = useState<AgentExecutionRun | null>(null);
  const [selectedToolToRun, setSelectedToolToRun] = useState<AgentCapability | null>(null);
  const [activeConfirmation, setActiveConfirmation] = useState<ConfirmationState | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const isDemo = projectId === "00000000-0000-4000-8000-000000000000" || projectId === "demo";

  // 1. Fetch Capabilities
  const {
    data: capabilitiesData,
    isLoading: isLoadingCapabilities,
    isError: isCapabilitiesError,
    refetch: refetchCapabilities,
  } = useQuery({
    queryKey: ["agent-capabilities", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/agent/capabilities/${projectId}`));
      if (!res.ok) {
        // Fallback for demo or offline mode
        return { capabilities: [] };
      }
      return res.json() as Promise<{ success: boolean; capabilities: AgentCapability[] }>;
    },
    enabled: !!projectId,
    staleTime: 1000 * 30, // 30s
  });

  const capabilities: AgentCapability[] = useMemo(() => {
    return capabilitiesData?.capabilities || [];
  }, [capabilitiesData]);

  // 2. Fetch Historical Tool Executions and Activity
  const {
    data: activityData,
    isLoading: isLoadingActivity,
    isError: isActivityError,
    refetch: refetchActivity,
    isFetching: isFetchingActivity,
  } = useQuery({
    queryKey: ["agent-activity-runs", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/dashboard/activity?limit=50`));
      if (!res.ok) {
        return [];
      }
      return res.json() as Promise<any[]>;
    },
    enabled: !!projectId,
    refetchInterval: 8000, // Poll fallback every 8 seconds
  });

  // Map and deduplicate raw activity items into typed AgentExecutionRuns
  useEffect(() => {
    if (activityData && Array.isArray(activityData)) {
      const mappedRuns: AgentExecutionRun[] = activityData
        .filter((act: any) => act.type === "tool_execution" || act.type === "security" || act.metadata?.actionName)
        .map((act: any) => ({
          id: act.id,
          type: act.type,
          title: act.title || `Action: ${act.metadata?.actionName || "Tool Execution"}`,
          detail: act.detail || act.title,
          status: act.status || "COMPLETED",
          timestamp: act.timestamp,
          projectId: act.projectId || projectId,
          metadata: act.metadata || {},
        }));

      setRealtimeRuns((prev) => {
        const map = new Map<string, AgentExecutionRun>();
        for (const r of mappedRuns) {
          map.set(r.id, r);
        }
        for (const r of prev) {
          if (!map.has(r.id)) {
            map.set(r.id, r);
          }
        }
        return Array.from(map.values()).sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
      });
    }
  }, [activityData, projectId]);

  // 3. Connect to Real-time SSE Stream
  useEffect(() => {
    if (!projectId) return;

    let isMounted = true;
    let abortController = new AbortController();
    let retryTimeout: any = null;

    async function initStream() {
      try {
        setStreamStatus("reconnecting");
        const streamUrl = apiUrl(`/api/projects/${projectId}/dashboard/activity/stream`);
        const res = await authFetch(streamUrl, {
          signal: abortController.signal,
          headers: { Accept: "text/event-stream" },
        });

        if (!res.ok || !res.body) {
          if (isMounted) setStreamStatus("polling");
          return;
        }

        if (isMounted) setStreamStatus("connected");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (isMounted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const chunk of parts) {
            const trimmed = chunk.trim();
            if (trimmed.startsWith("data: ")) {
              try {
                const event = JSON.parse(trimmed.slice(6));
                if (
                  event &&
                  event.id &&
                  (event.type === "tool_execution" || event.type === "security" || event.metadata?.actionName)
                ) {
                  const newRun: AgentExecutionRun = {
                    id: event.id,
                    type: event.type,
                    title: event.title,
                    detail: event.detail,
                    status: event.status || "COMPLETED",
                    timestamp: event.timestamp || new Date().toISOString(),
                    projectId: event.projectId || projectId,
                    metadata: event.metadata || {},
                  };

                  setRealtimeRuns((prev) => {
                    const map = new Map<string, AgentExecutionRun>();
                    map.set(newRun.id, newRun);
                    for (const item of prev) {
                      if (!map.has(item.id)) map.set(item.id, item);
                    }
                    return Array.from(map.values()).sort(
                      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    );
                  });
                }
              } catch (parseErr) {
                // Ignore parse errors on heartbeat
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.name !== "AbortError" && isMounted) {
          setStreamStatus("polling");
          // Reconnect with backoff
          retryTimeout = setTimeout(() => {
            if (isMounted) initStream();
          }, 7000);
        }
      }
    }

    initStream();

    return () => {
      isMounted = false;
      abortController.abort();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [projectId]);

  // 4. Handle Cryptographic Action Confirmation
  const handleConfirmAction = async (confirmation: ConfirmationState) => {
    setIsConfirming(true);
    try {
      const res = await authFetch(apiUrl("/api/agent/process"), {
        method: "POST",
        body: JSON.stringify({
          projectId,
          sessionId: `sess_conf_${Date.now()}`,
          message: `Confirm execution of ${confirmation.actionName}`,
          confirmationToken: confirmation.confirmationToken,
          actionId: confirmation.actionId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        throw new Error(data.error || data.data?.response || "Execution rejected by confirmation gate");
      }

      toast({
        title: "Action Confirmed & Executed",
        description: data.data?.response || `Successfully executed ${confirmation.actionName}.`,
      });

      setActiveConfirmation(null);
      refetchActivity();
      refetchCapabilities();
    } catch (err: any) {
      toast({
        title: "Confirmation Failed",
        description: err.message || "Failed to validate cryptographic token.",
        variant: "destructive",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Demo Sandbox Alert if in demo mode */}
      {isDemo && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-xs font-bold text-foreground">
                Demo Sandbox Environment
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tool executions in the demo project are safely isolated. Real production mutations are simulated without external side-effects.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30 font-bold shrink-0">
            Sandbox Active
          </Badge>
        </div>
      )}

      {/* Top Header & Connection Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border shadow-xs backdrop-blur-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Agent Control Center
            </h2>
            <Badge
              variant="outline"
              className="text-xs font-semibold px-2.5 py-0.5 bg-primary/10 text-primary border-primary/25"
            >
              Phase 8B
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Authoritative execution oversight, real-time run telemetry, and cryptographic risk guardrails.
          </p>
        </div>

        {/* Live SSE / Polling Stream Status Indicator */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
              streamStatus === "connected"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : streamStatus === "reconnecting"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : "bg-secondary text-muted-foreground border-border"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                streamStatus === "connected"
                  ? "bg-emerald-400 animate-pulse"
                  : streamStatus === "reconnecting"
                  ? "bg-amber-400 animate-ping"
                  : "bg-muted-foreground"
              }`}
            />
            <span>
              {streamStatus === "connected"
                ? "Live Stream (SSE)"
                : streamStatus === "reconnecting"
                ? "Reconnecting..."
                : "Auto-syncing (Polling)"}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchActivity();
              refetchCapabilities();
            }}
            disabled={isFetchingActivity}
            className="h-8 px-2.5 rounded-xl border-border text-xs gap-1.5"
            title="Refresh state"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetchingActivity ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Sync</span>
          </Button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs
        value={activeTab}
        onValueChange={(val: any) => setActiveTab(val)}
        className="w-full space-y-6"
      >
        <TabsList className="bg-muted/50 border border-border p-1 w-full flex overflow-x-auto justify-start h-11 rounded-xl">
          <TabsTrigger
            value="overview"
            className="flex-1 min-w-[120px] rounded-lg text-xs font-semibold data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
          >
            <Activity className="w-3.5 h-3.5 mr-1.5" />
            <span>Overview & Flow</span>
          </TabsTrigger>

          <TabsTrigger
            value="runs"
            className="flex-1 min-w-[120px] rounded-lg text-xs font-semibold data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
          >
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            <span>Run History ({realtimeRuns.length})</span>
          </TabsTrigger>

          <TabsTrigger
            value="capabilities"
            className="flex-1 min-w-[130px] rounded-lg text-xs font-semibold data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
          >
            <Cpu className="w-3.5 h-3.5 mr-1.5" />
            <span>Capabilities ({capabilities.length})</span>
          </TabsTrigger>

          <TabsTrigger
            value="policy"
            className="flex-1 min-w-[120px] rounded-lg text-xs font-semibold data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
          >
            <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
            <span>Policy & Guardrails</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-6 mt-0">
          <AgentExecutionOverview
            capabilities={capabilities}
            runs={realtimeRuns}
            onTriggerTestModal={() => {
              const execTool = capabilities.find((c) => c.status === "EXECUTABLE");
              setSelectedToolToRun(execTool || capabilities[0] || null);
            }}
            onNavigateToRuns={() => setActiveTab("runs")}
            onNavigateToTools={() => setActiveTab("capabilities")}
          />
        </TabsContent>

        {/* Tab 2: Run History */}
        <TabsContent value="runs" className="space-y-6 mt-0">
          <AgentRunHistory
            runs={realtimeRuns}
            isLoading={isLoadingActivity}
            onRefresh={refetchActivity}
            onInspectRun={(run) => setSelectedRunForTimeline(run)}
          />
        </TabsContent>

        {/* Tab 3: Capabilities */}
        <TabsContent value="capabilities" className="space-y-6 mt-0">
          <AgentCapabilitiesManager
            capabilities={capabilities}
            isLoading={isLoadingCapabilities}
            onRefresh={refetchCapabilities}
            onRunTool={(tool) => setSelectedToolToRun(tool)}
          />
        </TabsContent>

        {/* Tab 4: Policy & Guardrails */}
        <TabsContent value="policy" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-card/70 border-border shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Authoritative Risk Matrix</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Hierarchical risk classification enforced across all agents and endpoints.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-muted/40 border border-border/80 flex items-start gap-3">
                  <Badge variant="outline" className="text-[10px] font-bold text-emerald-400 border-emerald-500/30 shrink-0">
                    READ_ONLY
                  </Badge>
                  <p className="text-muted-foreground leading-relaxed">
                    Zero side-effects on business data. Permitted autonomously under valid entitlement and rate quotas.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-border/80 flex items-start gap-3">
                  <Badge variant="outline" className="text-[10px] font-bold text-blue-400 border-blue-500/30 shrink-0">
                    LOW_RISK_WRITE
                  </Badge>
                  <p className="text-muted-foreground leading-relaxed">
                    Reversible business mutations (e.g. creating draft product). Enforces RBAC permissions.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-border/80 flex items-start gap-3">
                  <Badge variant="outline" className="text-[10px] font-bold text-amber-400 border-amber-500/30 shrink-0">
                    HIGH_RISK_WRITE
                  </Badge>
                  <p className="text-muted-foreground leading-relaxed">
                    Impactful mutations (e.g. deleting products, updating pricing). Mandatory cryptographic confirmation token.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-border/80 flex items-start gap-3">
                  <Badge variant="outline" className="text-[10px] font-bold text-rose-400 border-rose-500/30 shrink-0">
                    IRREVERSIBLE
                  </Badge>
                  <p className="text-muted-foreground leading-relaxed">
                    Permanent changes. Strictly requires human confirmation and owner/admin elevation.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/70 border-border shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Lock className="w-4 h-4 text-primary" />
                  <span>Cryptographic Nonce Security</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  HMAC token generation prevents unauthorized or replayed tool actions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="p-3.5 rounded-xl bg-muted/40 border border-border/80 space-y-1.5">
                  <span className="font-bold text-foreground">Anti-Tamper Signature</span>
                  <p className="text-muted-foreground leading-relaxed">
                    Tokens bind userId, projectId, sessionId, actionId, and actionType. Any parameter tampering causes immediate rejection.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-muted/40 border border-border/80 space-y-1.5">
                  <span className="font-bold text-foreground">Single-Use Nonce & Atomic Consumption</span>
                  <p className="text-muted-foreground leading-relaxed">
                    Once an action executes, its nonce is atomically consumed in database storage to prevent replay attacks.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-muted/40 border border-border/80 space-y-1.5">
                  <span className="font-bold text-foreground">Truthful Output Verification</span>
                  <p className="text-muted-foreground leading-relaxed">
                    The Verification Agent confirms post-action state with the upstream provider before signaling success to the user.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Execution Timeline Inspect Drawer/Modal */}
      <AgentExecutionTimeline
        run={selectedRunForTimeline}
        open={!!selectedRunForTimeline}
        onOpenChange={(open) => {
          if (!open) setSelectedRunForTimeline(null);
        }}
      />

      {/* Test Tool Runner Modal */}
      <AgentToolRunnerModal
        tool={selectedToolToRun}
        projectId={projectId}
        open={!!selectedToolToRun}
        onOpenChange={(open) => {
          if (!open) setSelectedToolToRun(null);
        }}
        onRequestConfirmation={(conf) => {
          setActiveConfirmation(conf);
        }}
        onExecutionSuccess={() => {
          refetchActivity();
        }}
      />

      {/* High-Risk Action Confirmation Dialog */}
      <ActionConfirmationModal
        open={!!activeConfirmation}
        onOpenChange={(open) => {
          if (!open) setActiveConfirmation(null);
        }}
        confirmation={activeConfirmation}
        onConfirm={handleConfirmAction}
        isConfirming={isConfirming}
      />
    </div>
  );
}
