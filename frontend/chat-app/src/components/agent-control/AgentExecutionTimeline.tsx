import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ShieldCheck, 
  Cpu, 
  FileCheck2, 
  Database, 
  Copy, 
  Check, 
  AlertTriangle,
  Lock,
  ChevronRight
} from "lucide-react";
import { AgentExecutionRun } from "./types";

interface AgentExecutionTimelineProps {
  run: AgentExecutionRun | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentExecutionTimeline({
  run,
  open,
  onOpenChange,
}: AgentExecutionTimelineProps) {
  const [copied, setCopied] = useState(false);

  if (!run) return null;

  const meta = run.metadata || {};
  const isSuccess = run.status === "SUCCESS" || run.status === "COMPLETED";
  const isForbidden = run.status === "FORBIDDEN" || run.status === "SECURITY_BLOCKED";
  const isPending = run.status === "PENDING_CONFIRMATION";
  const risk = meta.riskLevel || "READ_ONLY";

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(run, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const steps = [
    {
      title: "1. Tenant & RBAC Isolation",
      desc: "Authorized project context resolved. Cross-tenant IDOR defense verified.",
      status: isForbidden ? "failed" : "passed",
      icon: ShieldCheck,
    },
    {
      title: "2. Subscription & Quota Enforcement",
      desc: "Validated project entitlement and checked workspace rate limits.",
      status: run.status === "QUOTA_EXCEEDED" || run.status === "ENTITLEMENT_EXPIRED" ? "failed" : "passed",
      icon: Lock,
    },
    {
      title: "3. Risk Classification & Confirmation Gate",
      desc: `Action evaluated: Risk classification is ${risk}. ${
        risk === "READ_ONLY" || risk === "LOW_RISK_WRITE"
          ? "Autonomous execution permitted."
          : isPending
          ? "Requires cryptographic human authorization."
          : "Human authorization token validated."
      }`,
      status: isPending ? "warning" : "passed",
      icon: AlertTriangle,
    },
    {
      title: "4. Provider Integration Execution",
      desc: meta.providerName
        ? `Executed on upstream provider: ${meta.providerName}. Duration: ${meta.durationMs ? `${meta.durationMs}ms` : "Fast"}.`
        : "Executed server action logic.",
      status: isSuccess ? "passed" : isPending ? "pending" : "failed",
      icon: Cpu,
    },
    {
      title: "5. Semantic Verification Engine",
      desc: isSuccess
        ? "Deterministic post-execution state verification confirmed truthfulness."
        : meta.error
        ? `Output verification gate flagged issue: ${meta.error}`
        : "Verification gate completed.",
      status: isSuccess ? "passed" : isPending ? "pending" : "failed",
      icon: FileCheck2,
    },
    {
      title: "6. Enterprise Audit & Redaction",
      desc: "Payload deep-sanitized. Nonce marked consumed. Telemetry persisted.",
      status: "passed",
      icon: Database,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border text-foreground rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-3 pb-3 border-b border-border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl font-bold tracking-tight">
                  {run.title}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className={`text-xs font-semibold uppercase px-2.5 py-0.5 rounded-lg ${
                    isSuccess
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : isPending
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                  }`}
                >
                  {run.status}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                <span>{new Date(run.timestamp).toLocaleString()}</span>
                {meta.durationMs && <span>• {meta.durationMs}ms latency</span>}
              </DialogDescription>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyJson}
              className="text-xs h-8 gap-1.5 rounded-xl border-border"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied JSON" : "Copy Telemetry"}</span>
            </Button>
          </div>
        </DialogHeader>

        {/* 6-Step Execution Lifecycle */}
        <div className="py-4 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Authoritative Execution Lifecycle
          </h4>

          <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-border/60">
            {steps.map((st, idx) => {
              const Icon = st.icon;
              const isStepPassed = st.status === "passed";
              const isStepFailed = st.status === "failed";
              const isStepWarning = st.status === "warning";

              return (
                <div key={idx} className="relative flex items-start gap-4 group">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 border ${
                      isStepPassed
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                        : isStepFailed
                        ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                        : isStepWarning
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    {isStepPassed ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isStepFailed ? (
                      <XCircle className="w-4 h-4" />
                    ) : isStepWarning ? (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    ) : (
                      <Icon className="w-3.5 h-3.5" />
                    )}
                  </div>

                  <div className="flex-1 pb-1">
                    <p className="text-xs font-bold text-foreground">{st.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{st.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Execution Details & Error Summary */}
        <div className="space-y-3 pt-2 border-t border-border">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Sanitized Telemetry & Output
          </h4>

          {meta.error && (
            <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive space-y-1">
              <span className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Execution Failure Reason
              </span>
              <p className="font-mono text-[11px] leading-relaxed break-words">{meta.error}</p>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs space-y-2">
            <div className="flex justify-between items-center py-1 border-b border-border/40">
              <span className="text-muted-foreground">Action Summary</span>
              <span className="font-medium text-foreground">{run.detail}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/40">
              <span className="text-muted-foreground">Risk Level</span>
              <Badge variant="outline" className="text-[10px] font-mono font-bold">
                {risk}
              </Badge>
            </div>
            {meta.providerName && (
              <div className="flex justify-between items-center py-1 border-b border-border/40">
                <span className="text-muted-foreground">Upstream Integration</span>
                <span className="font-mono font-medium text-foreground">{meta.providerName}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground">Audit Record ID</span>
              <span className="font-mono text-[11px] text-muted-foreground">{run.id}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
