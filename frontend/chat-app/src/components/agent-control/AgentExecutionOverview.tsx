import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  CheckCircle2,
  Cpu,
  ShieldCheck,
  Zap,
  Lock,
  FileCheck2,
  Database,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Play,
  Layers,
  Sparkles,
} from "lucide-react";
import { AgentCapability, AgentExecutionRun } from "./types";

interface AgentExecutionOverviewProps {
  capabilities: AgentCapability[];
  runs: AgentExecutionRun[];
  onTriggerTestModal?: () => void;
  onNavigateToRuns?: () => void;
  onNavigateToTools?: () => void;
}

export function AgentExecutionOverview({
  capabilities,
  runs,
  onTriggerTestModal,
  onNavigateToRuns,
  onNavigateToTools,
}: AgentExecutionOverviewProps) {
  const totalRuns = runs.length;
  const successfulRuns = runs.filter(
    (r) => r.status === "SUCCESS" || r.status === "COMPLETED"
  ).length;
  const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 100;

  const executableTools = capabilities.filter((c) => c.status === "EXECUTABLE").length;
  const highRiskTools = capabilities.filter(
    (c) => c.riskLevel === "HIGH_RISK_WRITE" || c.riskLevel === "IRREVERSIBLE"
  ).length;

  const pipelineSteps = [
    { num: 1, name: "Intent Analysis", desc: "Extract action & parameters", icon: Sparkles },
    { num: 2, name: "Tenant IDOR Guard", desc: "Fail-closed org validation", icon: ShieldCheck },
    { num: 3, name: "Quota & Billing", desc: "Entitlement verification", icon: Lock },
    { num: 4, name: "Tool Authorization", desc: "Database state check", icon: Cpu },
    { num: 5, name: "RBAC Security Gate", desc: "Human policy evaluation", icon: ShieldCheck },
    { num: 6, name: "Crypto Nonce", desc: "Anti-tamper & anti-replay", icon: Lock },
    { num: 7, name: "Provider Execution", desc: "Live integration call", icon: Zap },
    { num: 8, name: "State Verification", desc: "Post-action truthfulness", icon: FileCheck2 },
    { num: 9, name: "Enterprise Audit", desc: "Sanitized log persistence", icon: Database },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Runs */}
        <Card className="bg-card/70 border-border shadow-xs backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Executions
            </CardTitle>
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">{totalRuns}</div>
            <p className="text-xs text-muted-foreground mt-1">Recorded audit events</p>
          </CardContent>
        </Card>

        {/* Success Rate */}
        <Card className="bg-card/70 border-border shadow-xs backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Verification Rate
            </CardTitle>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">{successRate}%</div>
            <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{successfulRuns} completed verified</span>
            </p>
          </CardContent>
        </Card>

        {/* Executable Tools */}
        <Card className="bg-card/70 border-border shadow-xs backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Executable Tools
            </CardTitle>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">{executableTools}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Of {capabilities.length} total discovered
            </p>
          </CardContent>
        </Card>

        {/* Risk Guardrails */}
        <Card className="bg-card/70 border-border shadow-xs backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              High-Risk Gated
            </CardTitle>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">{highRiskTools}</div>
            <p className="text-xs text-amber-400 mt-1 font-medium">
              Requires cryptographic token
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 9-Step Architecture Pipeline */}
      <Card className="bg-card/70 border-border shadow-xs backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                <span>Authoritative 9-Step Agent Control Pipeline</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Every business write and read operation passes deterministically through this security & verification lifecycle.
              </CardDescription>
            </div>
            {onNavigateToTools && (
              <Button
                variant="outline"
                size="sm"
                onClick={onNavigateToTools}
                className="text-xs rounded-xl h-8 gap-1.5"
              >
                <span>View Capabilities</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-9 gap-2 pt-2">
            {pipelineSteps.map((st) => {
              const Icon = st.icon;
              return (
                <div
                  key={st.num}
                  className="p-3 rounded-xl bg-muted/40 border border-border/80 flex flex-col justify-between gap-2 hover:bg-muted/70 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-muted-foreground">
                      0{st.num}
                    </span>
                    <Icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-foreground leading-tight">{st.name}</h5>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{st.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity Quick Preview & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-foreground">Recent Agent Runs</h4>
            {onNavigateToRuns && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onNavigateToRuns}
                className="text-xs text-primary hover:text-primary/90 h-8 gap-1"
              >
                <span>View All Runs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          {runs.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-muted/30 border border-border space-y-2">
              <Activity className="w-8 h-8 text-muted-foreground mx-auto" />
              <h5 className="text-xs font-bold text-foreground">No Executions Recorded Yet</h5>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Trigger tools through the Capabilities catalog or ask NOVA Chat to execute connected actions.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {runs.slice(0, 5).map((run) => (
                <div
                  key={run.id}
                  className="p-3.5 rounded-xl bg-card border border-border/80 flex items-center justify-between gap-4 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        run.status === "SUCCESS" || run.status === "COMPLETED"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : run.status === "PENDING_CONFIRMATION"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                      }`}
                    >
                      {run.status === "SUCCESS" || run.status === "COMPLETED" ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : run.status === "PENDING_CONFIRMATION" ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : (
                        <Cpu className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{run.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{run.detail}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {run.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(run.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security & Action Quick Box */}
        <Card className="bg-card/70 border-border shadow-xs backdrop-blur-sm h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Security & Risk Guardrails</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-muted/40 border border-border/80 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">IDOR Tenant Defense</span>
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                  Enforced
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Queries and tool executions are strictly isolated by organization and project context.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-muted/40 border border-border/80 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Anti-Replay Nonce</span>
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                  Active
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Tokens are cryptographically signed with 300s TTL and single-use atomic consumption.
              </p>
            </div>

            {onTriggerTestModal && (
              <Button
                onClick={onTriggerTestModal}
                className="w-full text-xs font-bold rounded-xl h-9 gap-1.5 bg-gradient-to-r from-primary to-indigo-600 hover:opacity-90"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Test Executable Capability</span>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
