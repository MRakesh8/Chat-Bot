import React, { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Cpu,
  Search,
  Play,
  ShieldAlert,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { AgentCapability } from "./types";

interface AgentCapabilitiesManagerProps {
  capabilities: AgentCapability[];
  isLoading: boolean;
  onRefresh: () => void;
  onRunTool: (tool: AgentCapability) => void;
}

export function AgentCapabilitiesManager({
  capabilities,
  isLoading,
  onRefresh,
  onRunTool,
}: AgentCapabilitiesManagerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const filteredCapabilities = useMemo(() => {
    return capabilities.filter((cap) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !cap.name.toLowerCase().includes(q) &&
          !cap.providerId.toLowerCase().includes(q) &&
          !cap.capabilityId.toLowerCase().includes(q)
        ) {
          return false;
        }
      }

      if (statusFilter !== "ALL") {
        if (cap.status !== statusFilter) return false;
      }

      return true;
    });
  }, [capabilities, searchQuery, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Search & Header */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search capabilities by name or provider..."
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
        </div>
      </div>

      {/* Grid of Capability Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredCapabilities.length === 0 ? (
          <div className="md:col-span-2 p-12 text-center rounded-2xl bg-card border border-border space-y-3">
            <Cpu className="w-10 h-10 text-muted-foreground mx-auto opacity-60" />
            <h4 className="text-sm font-bold text-foreground">No Capabilities Found</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No matching capabilities found. Connect integrations to discover additional tools.
            </p>
          </div>
        ) : (
          filteredCapabilities.map((cap) => {
            const isExecutable = cap.status === "EXECUTABLE";
            const isHighRisk =
              cap.riskLevel === "HIGH_RISK_WRITE" || cap.riskLevel === "IRREVERSIBLE";

            return (
              <div
                key={cap.capabilityId}
                className="p-5 rounded-2xl bg-card border border-border/80 hover:border-primary/40 transition-all duration-200 shadow-2xs space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          isExecutable
                            ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-foreground font-mono leading-tight">
                          {cap.name}
                        </h4>
                        <span className="text-[11px] text-muted-foreground capitalize">
                          Provider: {cap.providerId}
                        </span>
                      </div>
                    </div>

                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg ${
                        isExecutable
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : cap.status === "AUTHORIZED" || cap.status === "VERIFIED"
                          ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                          : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {cap.status}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {cap.description || `Authoritative capability for ${cap.providerId} operations.`}
                  </p>
                </div>

                <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-3">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono font-semibold px-2 py-0.5 ${
                      isHighRisk
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        : "bg-secondary text-muted-foreground border-border"
                    }`}
                  >
                    {cap.riskLevel}
                  </Badge>

                  {isExecutable ? (
                    <Button
                      size="sm"
                      onClick={() => onRunTool(cap)}
                      className="text-xs rounded-xl h-8 px-3 gap-1.5 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
                    >
                      <Play className="w-3 h-3" />
                      <span>Test Action</span>
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground italic">
                      Authorize integration to execute
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
