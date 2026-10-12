import React, { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  ExternalLink,
  Cpu,
  RotateCcw,
  Ban,
  Layers,
  Sparkles,
  Loader2,
} from "lucide-react";
import { AgentExecutionRecord, ExecutionStatus } from "./types";

interface AgentRunHistoryProps {
  executions: AgentExecutionRecord[];
  isLoading: boolean;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  onRefresh: () => void;
  onInspect: (execution: AgentExecutionRecord) => void;
  onCancel?: (executionId: string) => void;
  onRetry?: (executionId: string) => void;
  onApprove?: (execution: AgentExecutionRecord) => void;
  isActionLoading?: boolean;
}

export function AgentRunHistory({
  executions,
  isLoading,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
  onInspect,
  onCancel,
  onRetry,
  onApprove,
  isActionLoading = false,
}: AgentRunHistoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [agentTypeFilter, setAgentTypeFilter] = useState<string>("ALL");
  const [toolFilter, setToolFilter] = useState<string>("ALL");
  const [environmentFilter, setEnvironmentFilter] = useState<string>("ALL");

  const uniqueAgentTypes = useMemo(() => {
    const set = new Set<string>();
    for (const e of executions) {
      if (e.agentType) set.add(e.agentType);
    }
    return Array.from(set);
  }, [executions]);

  const uniqueTools = useMemo(() => {
    const set = new Set<string>();
    for (const e of executions) {
      if (Array.isArray(e.steps)) {
        for (const s of e.steps) {
          if (s.actionType) set.add(s.actionType);
          else if (s.name) set.add(s.name);
        }
      }
    }
    return Array.from(set);
  }, [executions]);

  const filteredExecutions = useMemo(() => {
    return executions.filter((exec) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = exec.title.toLowerCase().includes(q);
        const matchId = exec.id.toLowerCase().includes(q);
        const matchAgent = (exec.agentType || "").toLowerCase().includes(q);
        const matchError = (exec.error || "").toLowerCase().includes(q);
        const matchStep = exec.steps?.some(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.actionType && s.actionType.toLowerCase().includes(q)) ||
            (s.description && s.description.toLowerCase().includes(q))
        );
        if (!matchTitle && !matchId && !matchAgent && !matchError && !matchStep) {
          return false;
        }
      }

      // 2. Agent Type Filter
      if (agentTypeFilter !== "ALL") {
        if (exec.agentType !== agentTypeFilter) return false;
      }

      // 3. Tool Filter
      if (toolFilter !== "ALL") {
        const hasTool = exec.steps?.some(
          (s) => s.actionType === toolFilter || s.name === toolFilter
        );
        if (!hasTool) return false;
      }

      // 4. Environment Filter
      const isDemoRun = exec.id.startsWith("exec_demo");
      if (environmentFilter === "LIVE" && isDemoRun) return false;
      if (environmentFilter === "DEMO" && !isDemoRun) return false;

      return true;
    });
  }, [executions, searchQuery, agentTypeFilter, toolFilter, environmentFilter]);

  const clearFilters = () => {
    setSearchQuery("");
    onStatusFilterChange("all");
    setAgentTypeFilter("ALL");
    setToolFilter("ALL");
    setEnvironmentFilter("ALL");
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    statusFilter !== "all" ||
    agentTypeFilter !== "ALL" ||
    toolFilter !== "ALL" ||
    environmentFilter !== "ALL";

  return (
    <div className="space-y-4">
      {/* Search & Filters Bar */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by execution title, ID, agent type, step or error..."
              className="pl-9 bg-muted/40 border-border text-xs rounded-xl h-9 focus-visible:ring-primary/40"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-9 px-3 rounded-xl border-border text-xs gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 px-3 rounded-xl text-xs text-muted-foreground hover:text-foreground"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Multi-Dimensional Filter Selects */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="h-8 text-xs rounded-xl bg-muted/30 border-border">
              <SelectValue placeholder="Status: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status: All States</SelectItem>
              <SelectItem value="RUNNING">Status: RUNNING</SelectItem>
              <SelectItem value="PENDING_APPROVAL">Status: PENDING_APPROVAL</SelectItem>
              <SelectItem value="COMPLETED">Status: COMPLETED</SelectItem>
              <SelectItem value="FAILED">Status: FAILED</SelectItem>
              <SelectItem value="CANCELLED">Status: CANCELLED</SelectItem>
              <SelectItem value="PENDING">Status: PENDING</SelectItem>
            </SelectContent>
          </Select>

          <Select value={agentTypeFilter} onValueChange={setAgentTypeFilter}>
            <SelectTrigger className="h-8 text-xs rounded-xl bg-muted/30 border-border">
              <SelectValue placeholder="Agent: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Agent: All Types</SelectItem>
              {uniqueAgentTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  Agent: {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={toolFilter} onValueChange={setToolFilter}>
            <SelectTrigger className="h-8 text-xs rounded-xl bg-muted/30 border-border">
              <SelectValue placeholder="Tool: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tool: All Executed</SelectItem>
              {uniqueTools.map((t) => (
                <SelectItem key={t} value={t}>
                  Tool: {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={environmentFilter} onValueChange={setEnvironmentFilter}>
            <SelectTrigger className="h-8 text-xs rounded-xl bg-muted/30 border-border">
              <SelectValue placeholder="Env: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Env: Live & Demo</SelectItem>
              <SelectItem value="LIVE">Env: Live Workspace</SelectItem>
              <SelectItem value="DEMO">Env: Demo Sandbox</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Execution Records List */}
      <div className="space-y-2.5">
        {filteredExecutions.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-card border border-border space-y-3">
            <Cpu className="w-10 h-10 text-muted-foreground mx-auto opacity-60" />
            <h4 className="text-sm font-bold text-foreground">
              {hasActiveFilters ? "No matching execution runs found" : "No execution runs recorded"}
            </h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {hasActiveFilters
                ? "Try adjusting your search criteria or resetting the filters."
                : "Active and completed agent execution runs will be persisted and tracked here."}
            </p>
            {hasActiveFilters && (
              <Button onClick={clearFilters} variant="outline" size="sm" className="rounded-xl text-xs">
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          filteredExecutions.map((exec) => {
            const isCompleted = exec.status === "COMPLETED";
            const isFailed = exec.status === "FAILED";
            const isCancelled = exec.status === "CANCELLED";
            const isPendingApproval = exec.status === "PENDING_APPROVAL";
            const isRunning = exec.status === "RUNNING";
            const isPending = exec.status === "PENDING";

            const canCancel = (isRunning || isPending || isPendingApproval) && onCancel;
            const canRetry = (isFailed || isCancelled) && exec.retryCount < exec.maxRetries && onRetry;
            const canApprove = isPendingApproval && onApprove;

            const totalSteps = exec.steps?.length || 0;
            const completedSteps = exec.steps?.filter((s) => s.status === "COMPLETED").length || 0;
            const isDemoRun = exec.id.startsWith("exec_demo");

            return (
              <div
                key={exec.id}
                className="group p-4 rounded-2xl bg-card border border-border/80 hover:border-primary/40 transition-all duration-200 shadow-2xs hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div
                  className="flex items-start gap-3.5 min-w-0 flex-1 cursor-pointer"
                  onClick={() => onInspect(exec)}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                      isCompleted
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : isRunning
                        ? "bg-primary/10 text-primary border-primary/30 animate-pulse"
                        : isPendingApproval
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        : isCancelled
                        ? "bg-muted text-muted-foreground border-border"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isPendingApproval ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : isCancelled ? (
                      <Ban className="w-4 h-4" />
                    ) : isFailed ? (
                      <XCircle className="w-4 h-4" />
                    ) : (
                      <Cpu className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                        {exec.title}
                      </span>
                      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 border-border">
                        {exec.agentType}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[9px] font-mono px-1.5 py-0 ${
                          isDemoRun
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-primary/10 text-primary border-primary/30"
                        }`}
                      >
                        {isDemoRun ? "SANDBOX" : "LIVE"}
                      </Badge>
                      {totalSteps > 0 && (
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                            isPendingApproval
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30 font-bold"
                              : isFailed
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                              : isCompleted
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-muted/80 text-muted-foreground border-border"
                          }`}
                        >
                          {completedSteps}/{totalSteps} steps {isPendingApproval ? "(Approval Needed)" : isCompleted ? "completed" : "done"}
                        </span>
                      )}
                      {exec.retryCount > 0 && (
                        <span className="text-[10px] text-amber-400 font-mono">
                          (Retry {exec.retryCount}/{exec.maxRetries})
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground font-mono truncate">
                      ID: {exec.id}
                    </p>

                    {/* Step Action Tools Preview */}
                    {exec.steps && exec.steps.some((s) => s.actionType || s.name) && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        {Array.from(
                          new Set(
                            exec.steps
                              .map((s) => s.actionType || s.name)
                              .filter((n): n is string => Boolean(n))
                          )
                        ).map((toolName) => (
                          <span
                            key={toolName}
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground border border-border/60"
                          >
                            ⚙️ {toolName}
                          </span>
                        ))}
                      </div>
                    )}

                    {exec.error && (
                      <p className="text-[11px] text-rose-400 font-mono line-clamp-1">
                        Error: {exec.error}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right Metadata & Action Buttons */}
                <div className="flex items-center justify-between md:justify-end gap-2.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/40">
                  <div className="text-left md:text-right text-[11px] text-muted-foreground font-mono space-y-0.5">
                    <div>{new Date(exec.createdAt).toLocaleDateString()} {new Date(exec.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>

                  <Badge
                    variant="outline"
                    className={`text-xs font-semibold uppercase px-2.5 py-1 rounded-xl ${
                      isCompleted
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : isRunning
                        ? "bg-primary/10 text-primary border-primary/30"
                        : isPendingApproval
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        : isCancelled
                        ? "bg-muted text-muted-foreground border-border"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                    }`}
                  >
                    {exec.status}
                  </Badge>

                  {/* Contextual Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    {canApprove && (
                      <Button
                        size="sm"
                        disabled={isActionLoading}
                        onClick={() => onApprove!(exec)}
                        className="h-8 px-2.5 text-xs font-bold gap-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
                        title="Approve Run"
                      >
                        {isActionLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        <span>Approve</span>
                      </Button>
                    )}

                    {canRetry && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isActionLoading}
                        onClick={() => onRetry!(exec.id)}
                        className="h-8 px-2.5 text-xs font-semibold gap-1 border-border rounded-xl"
                        title="Retry Run"
                      >
                        {isActionLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3 h-3" />
                        )}
                        <span>Retry</span>
                      </Button>
                    )}

                    {canCancel && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isActionLoading}
                        onClick={() => onCancel!(exec.id)}
                        className="h-8 px-2 text-xs font-semibold text-rose-400 border-rose-500/30 hover:bg-rose-500/10 rounded-xl"
                        title="Cancel Run"
                      >
                        {isActionLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Ban className="w-3 h-3" />
                        )}
                        <span>Cancel</span>
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onInspect(exec)}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl"
                      title="Inspect Timeline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
