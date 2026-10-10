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
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  ExternalLink,
  Cpu,
  ShieldAlert,
  ArrowUpDown,
  SlidersHorizontal,
} from "lucide-react";
import { AgentExecutionRun, RiskLevel } from "./types";

interface AgentRunHistoryProps {
  runs: AgentExecutionRun[];
  isLoading: boolean;
  onRefresh: () => void;
  onInspectRun: (run: AgentExecutionRun) => void;
}

export function AgentRunHistory({
  runs,
  isLoading,
  onRefresh,
  onInspectRun,
}: AgentRunHistoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [riskFilter, setRiskFilter] = useState<string>("ALL");
  const [providerFilter, setProviderFilter] = useState<string>("ALL");

  // Derive unique providers from runs
  const uniqueProviders = useMemo(() => {
    const set = new Set<string>();
    for (const r of runs) {
      if (r.metadata?.providerName) {
        set.add(r.metadata.providerName);
      }
    }
    return Array.from(set);
  }, [runs]);

  // Filter runs based on active filters & search query
  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = run.title.toLowerCase().includes(query);
        const matchDetail = run.detail.toLowerCase().includes(query);
        const matchId = run.id.toLowerCase().includes(query);
        const matchProvider = (run.metadata?.providerName || "").toLowerCase().includes(query);
        const matchAction = (run.metadata?.actionName || "").toLowerCase().includes(query);
        if (!matchTitle && !matchDetail && !matchId && !matchProvider && !matchAction) {
          return false;
        }
      }

      // 2. Status Filter
      if (statusFilter !== "ALL") {
        const st = (run.status || "").toUpperCase();
        if (statusFilter === "SUCCESS") {
          if (st !== "SUCCESS" && st !== "COMPLETED") return false;
        } else if (statusFilter === "FAILED") {
          if (st !== "FAILED" && st !== "EXECUTION_FAILED" && st !== "FORBIDDEN") return false;
        } else if (statusFilter === "PENDING") {
          if (st !== "PENDING_CONFIRMATION") return false;
        }
      }

      // 3. Risk Level Filter
      if (riskFilter !== "ALL") {
        const rRisk = run.metadata?.riskLevel || "READ_ONLY";
        if (rRisk !== riskFilter) return false;
      }

      // 4. Provider Filter
      if (providerFilter !== "ALL") {
        if (run.metadata?.providerName !== providerFilter) return false;
      }

      return true;
    });
  }, [runs, searchQuery, statusFilter, riskFilter, providerFilter]);

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("ALL");
    setRiskFilter("ALL");
    setProviderFilter("ALL");
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    statusFilter !== "ALL" ||
    riskFilter !== "ALL" ||
    providerFilter !== "ALL";

  return (
    <div className="space-y-4">
      {/* Search & Filters Header */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by action name, provider, error, or audit ID..."
              className="pl-9 bg-muted/40 border-border text-xs rounded-xl h-9 focus-visible:ring-primary/40"
            />
          </div>

          {/* Quick Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-9 px-3 rounded-xl border-border text-xs gap-1.5"
              title="Refresh executions feed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 px-3 rounded-xl text-xs text-muted-foreground hover:text-foreground"
              >
                Reset Filters
              </Button>
            )}
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs rounded-xl bg-muted/30 border-border">
              <SelectValue placeholder="Status: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Status: All</SelectItem>
              <SelectItem value="SUCCESS">Status: Success & Completed</SelectItem>
              <SelectItem value="FAILED">Status: Failed or Blocked</SelectItem>
              <SelectItem value="PENDING">Status: Pending Confirmation</SelectItem>
            </SelectContent>
          </Select>

          {/* Risk Level Filter */}
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="h-8 text-xs rounded-xl bg-muted/30 border-border">
              <SelectValue placeholder="Risk: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Risk: All</SelectItem>
              <SelectItem value="READ_ONLY">Risk: READ_ONLY</SelectItem>
              <SelectItem value="LOW_RISK_WRITE">Risk: LOW_RISK_WRITE</SelectItem>
              <SelectItem value="HIGH_RISK_WRITE">Risk: HIGH_RISK_WRITE</SelectItem>
              <SelectItem value="IRREVERSIBLE">Risk: IRREVERSIBLE</SelectItem>
            </SelectContent>
          </Select>

          {/* Provider Filter */}
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="h-8 text-xs rounded-xl bg-muted/30 border-border">
              <SelectValue placeholder="Provider: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Provider: All</SelectItem>
              {uniqueProviders.map((p) => (
                <SelectItem key={p} value={p}>
                  Provider: {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Executions Table / Cards List */}
      <div className="space-y-2.5">
        {filteredRuns.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-card border border-border space-y-3">
            <Cpu className="w-10 h-10 text-muted-foreground mx-auto opacity-60" />
            <h4 className="text-sm font-bold text-foreground">
              {hasActiveFilters ? "No matching executions found" : "No executions recorded"}
            </h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {hasActiveFilters
                ? "Try adjusting your search terms or resetting the filter options."
                : "Tool executions triggered through NOVA Chat or the Capabilities catalog will be recorded here."}
            </p>
            {hasActiveFilters && (
              <Button onClick={clearFilters} variant="outline" size="sm" className="rounded-xl text-xs">
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          filteredRuns.map((run) => {
            const meta = run.metadata || {};
            const isSuccess = run.status === "SUCCESS" || run.status === "COMPLETED";
            const isPending = run.status === "PENDING_CONFIRMATION";
            const isFailed = !isSuccess && !isPending;
            const risk = meta.riskLevel || "READ_ONLY";

            return (
              <div
                key={run.id}
                onClick={() => onInspectRun(run)}
                className="group p-4 rounded-2xl bg-card border border-border/80 hover:border-primary/50 transition-all duration-200 cursor-pointer shadow-2xs hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                      isSuccess
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : isPending
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                    }`}
                  >
                    {isSuccess ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isPending ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                        {run.title}
                      </span>
                      {meta.providerName && (
                        <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 border-border">
                          {meta.providerName}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono px-1.5 py-0 ${
                          risk === "HIGH_RISK_WRITE" || risk === "IRREVERSIBLE"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {risk}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-1">
                      {run.detail}
                    </p>

                    {meta.error && (
                      <p className="text-[11px] text-rose-400 font-mono line-clamp-1">
                        Error: {meta.error}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/40">
                  <div className="text-left md:text-right text-[11px] text-muted-foreground font-mono space-y-0.5">
                    <div>{new Date(run.timestamp).toLocaleDateString()} {new Date(run.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    {meta.durationMs && <div>{meta.durationMs}ms duration</div>}
                  </div>

                  <Badge
                    variant="outline"
                    className={`text-xs font-semibold uppercase px-2.5 py-1 rounded-xl ${
                      isSuccess
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : isPending
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                    }`}
                  >
                    {run.status}
                  </Badge>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground group-hover:text-foreground group-hover:bg-muted rounded-xl shrink-0"
                    title="Inspect Execution Timeline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
