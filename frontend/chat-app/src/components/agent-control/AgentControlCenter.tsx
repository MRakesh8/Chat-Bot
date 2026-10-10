import React, { useState, useEffect, useMemo } from "react";
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
  Clock,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import {
  AgentCapability,
  AgentExecutionRecord,
  ExecutionStats,
  ConfirmationState,
  ExecutionApprovalState,
  StreamConnectionState,
} from "./types";
import { AgentExecutionOverview } from "./AgentExecutionOverview";
import { AgentRunHistory } from "./AgentRunHistory";
import { AgentCapabilitiesManager } from "./AgentCapabilitiesManager";
import { AgentExecutionTimeline } from "./AgentExecutionTimeline";
import { AgentToolRunnerModal } from "./AgentToolRunnerModal";
import { ActionConfirmationModal } from "./ActionConfirmationModal";
import { ExecutionApprovalModal } from "./ExecutionApprovalModal";

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
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modals state
  const [selectedExecutionForTimeline, setSelectedExecutionForTimeline] = useState<AgentExecutionRecord | null>(null);
  const [selectedToolToRun, setSelectedToolToRun] = useState<AgentCapability | null>(null);
  const [activeToolConfirmation, setActiveToolConfirmation] = useState<ConfirmationState | null>(null);
  const [activeExecutionApproval, setActiveExecutionApproval] = useState<ExecutionApprovalState | null>(null);

  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isToolConfirming, setIsToolConfirming] = useState(false);

  const isDemo = projectId === "00000000-0000-4000-8000-000000000000" || projectId === "demo";

  // 1. Fetch Persisted Executions from Real Phase 8A Endpoint
  const {
    data: executionsData,
    isLoading: isLoadingExecutions,
    isError: isExecutionsError,
    refetch: refetchExecutions,
    isFetching: isFetchingExecutions,
  } = useQuery({
    queryKey: ["project-executions", projectId, statusFilter],
    queryFn: async () => {
      const url = apiUrl(
        `/api/projects/${projectId}/executions?status=${statusFilter}&limit=50&offset=0`
      );
      const res = await authFetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load executions (HTTP ${res.status})`);
      }
      return res.json() as Promise<{
        executions: AgentExecutionRecord[];
        totalCount: number;
        runningCount: number;
        pendingApprovalCount: number;
        failedCount: number;
        completedCount: number;
      }>;
    },
    enabled: !!projectId,
    refetchInterval: 6000, // Poll fallback every 6 seconds
  });

  const executions: AgentExecutionRecord[] = useMemo(() => {
    return executionsData?.executions || [];
  }, [executionsData]);

  // 2. Fetch Run Statistics from Real Phase 8A Stats Endpoint
  const {
    data: executionStats,
    refetch: refetchStats,
  } = useQuery<ExecutionStats>({
    queryKey: ["project-execution-stats", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/executions/stats`));
      if (!res.ok) {
        return {
          totalCount: executions.length,
          runningCount: executions.filter((e) => e.status === "RUNNING").length,
          pendingApprovalCount: executions.filter((e) => e.status === "PENDING_APPROVAL").length,
          failedCount: executions.filter((e) => e.status === "FAILED").length,
          completedCount: executions.filter((e) => e.status === "COMPLETED").length,
        };
      }
      return res.json();
    },
    enabled: !!projectId,
    refetchInterval: 6000,
  });

  // 3. Fetch Discovered Project Capabilities
  const {
    data: capabilitiesData,
    isLoading: isLoadingCapabilities,
    refetch: refetchCapabilities,
  } = useQuery({
    queryKey: ["agent-capabilities", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/agent/capabilities/${projectId}`));
      if (!res.ok) {
        return { capabilities: [] };
      }
      return res.json() as Promise<{ success: boolean; capabilities: AgentCapability[] }>;
    },
    enabled: !!projectId,
    staleTime: 1000 * 30,
  });

  const capabilities: AgentCapability[] = useMemo(() => {
    return capabilitiesData?.capabilities || [];
  }, [capabilitiesData]);

  // 4. Real-time SSE Stream Integration
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
                if (event && event.type === "tool_execution") {
                  // Invalidate real executions queries upon live activity emission
                  queryClient.invalidateQueries({ queryKey: ["project-executions", projectId] });
                  queryClient.invalidateQueries({ queryKey: ["project-execution-stats", projectId] });
                }
              } catch (parseErr) {
                // Heartbeat / ping ignore
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.name !== "AbortError" && isMounted) {
          setStreamStatus("polling");
          retryTimeout = setTimeout(() => {
            if (isMounted) initStream();
          }, 8000);
        }
      }
    }

    initStream();

    return () => {
      isMounted = false;
      abortController.abort();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [projectId, queryClient]);

  // 5. Control: Cancel Execution
  const handleCancelExecution = async (executionId: string) => {
    setIsActionLoading(true);
    try {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/executions/${executionId}/cancel`), {
        method: "POST",
        body: JSON.stringify({ reason: "Cancelled by workspace operator" }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to cancel execution");
      }

      toast({
        title: "Execution Cancelled",
        description: `Run ${executionId.slice(0, 8)}... was successfully marked as CANCELLED.`,
      });

      // Update local state if timeline is open
      if (selectedExecutionForTimeline?.id === executionId && data.execution) {
        setSelectedExecutionForTimeline(data.execution);
      }

      refetchExecutions();
      refetchStats();
    } catch (err: any) {
      toast({
        title: "Cancellation Failed",
        description: err.message || "Unable to cancel execution.",
        variant: "destructive",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // 6. Control: Retry Execution
  const handleRetryExecution = async (executionId: string) => {
    setIsActionLoading(true);
    try {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/executions/${executionId}/retry`), {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to retry execution");
      }

      toast({
        title: "Execution Restarted",
        description: `Run ${executionId.slice(0, 8)}... has restarted processing steps.`,
      });

      if (selectedExecutionForTimeline?.id === executionId && data.execution) {
        setSelectedExecutionForTimeline(data.execution);
      }

      refetchExecutions();
      refetchStats();
    } catch (err: any) {
      toast({
        title: "Retry Rejected",
        description: err.message || "Failed to restart execution.",
        variant: "destructive",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // 7. Control: Approve Execution
  const handleApproveExecution = async (executionId: string, token?: string) => {
    setIsActionLoading(true);
    try {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/executions/${executionId}/approve`), {
        method: "POST",
        body: JSON.stringify({ approvalToken: token }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Approval rejected by server");
      }

      toast({
        title: "Execution Approved",
        description: `Run ${executionId.slice(0, 8)}... approved and transitioned to RUNNING.`,
      });

      setActiveExecutionApproval(null);
      if (selectedExecutionForTimeline?.id === executionId && data.execution) {
        setSelectedExecutionForTimeline(data.execution);
      }

      refetchExecutions();
      refetchStats();
    } catch (err: any) {
      toast({
        title: "Approval Failed",
        description: err.message || "Token mismatch or invalid approval state.",
        variant: "destructive",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // 8. Control: High-Risk Tool Execution Confirmation (distinct from Execution Approval)
  const handleConfirmToolAction = async (confirmation: ConfirmationState) => {
    setIsToolConfirming(true);
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
        title: "Tool Action Confirmed & Executed",
        description: data.data?.response || `Successfully executed ${confirmation.actionName}.`,
      });

      setActiveToolConfirmation(null);
      refetchExecutions();
      refetchStats();
      refetchCapabilities();
    } catch (err: any) {
      toast({
        title: "Tool Confirmation Failed",
        description: err.message || "Failed to validate cryptographic confirmation token.",
        variant: "destructive",
      });
    } finally {
      setIsToolConfirming(false);
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
                Executions in the demo project are safely isolated. Real production mutations are simulated with deterministic governance records.
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
              Phase 8B Integrated
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Authoritative execution oversight, persisted governance records, and cryptographic risk guardrails.
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
              refetchExecutions();
              refetchStats();
              refetchCapabilities();
            }}
            disabled={isFetchingExecutions}
            className="h-8 px-2.5 rounded-xl border-border text-xs gap-1.5"
            title="Sync execution state"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetchingExecutions ? "animate-spin" : ""}`} />
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
            <span>Run History ({executions.length})</span>
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
            stats={executionStats || null}
            capabilities={capabilities}
            executions={executions}
            onTriggerTestModal={() => {
              const execTool = capabilities.find((c) => c.status === "EXECUTABLE");
              setSelectedToolToRun(execTool || capabilities[0] || null);
            }}
            onNavigateToRuns={() => setActiveTab("runs")}
            onNavigateToTools={() => setActiveTab("capabilities")}
            onInspectRun={(exec) => setSelectedExecutionForTimeline(exec)}
          />
        </TabsContent>

        {/* Tab 2: Run History */}
        <TabsContent value="runs" className="space-y-6 mt-0">
          <AgentRunHistory
            executions={executions}
            isLoading={isLoadingExecutions}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onRefresh={refetchExecutions}
            onInspect={(exec) => setSelectedExecutionForTimeline(exec)}
            onCancel={handleCancelExecution}
            onRetry={handleRetryExecution}
            onApprove={(exec) => {
              setActiveExecutionApproval({
                executionId: exec.id,
                title: exec.title,
                agentType: exec.agentType,
                requiresToken: !!exec.approvalToken,
              });
            }}
            isActionLoading={isActionLoading}
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

      {/* Execution Timeline Inspect Drawer/Modal with real controls */}
      <AgentExecutionTimeline
        execution={selectedExecutionForTimeline}
        open={!!selectedExecutionForTimeline}
        onOpenChange={(open) => {
          if (!open) setSelectedExecutionForTimeline(null);
        }}
        onCancel={handleCancelExecution}
        onRetry={handleRetryExecution}
        onApprove={(exec) => {
          setActiveExecutionApproval({
            executionId: exec.id,
            title: exec.title,
            agentType: exec.agentType,
            requiresToken: !!exec.approvalToken,
          });
        }}
        isActionLoading={isActionLoading}
      />

      {/* Execution Approval Dialog for PENDING_APPROVAL runs */}
      <ExecutionApprovalModal
        open={!!activeExecutionApproval}
        onOpenChange={(open) => {
          if (!open) setActiveExecutionApproval(null);
        }}
        approvalState={activeExecutionApproval}
        onApprove={handleApproveExecution}
        isSubmitting={isActionLoading}
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
          setActiveToolConfirmation(conf);
        }}
        onExecutionSuccess={() => {
          refetchExecutions();
          refetchStats();
        }}
      />

      {/* Separate High-Risk Tool Execution Confirmation Dialog */}
      <ActionConfirmationModal
        open={!!activeToolConfirmation}
        onOpenChange={(open) => {
          if (!open) setActiveToolConfirmation(null);
        }}
        confirmation={activeToolConfirmation}
        onConfirm={handleConfirmToolAction}
        isConfirming={isToolConfirming}
      />
    </div>
  );
}
