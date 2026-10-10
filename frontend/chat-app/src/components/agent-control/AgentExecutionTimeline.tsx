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
  RotateCcw,
  Ban,
  Check,
  Copy,
  AlertTriangle,
  Lock,
  Layers,
  ChevronRight,
  Eye,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { AgentExecutionRecord } from "./types";

interface AgentExecutionTimelineProps {
  execution: AgentExecutionRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel?: (executionId: string) => void;
  onRetry?: (executionId: string) => void;
  onApprove?: (execution: AgentExecutionRecord) => void;
  isActionLoading?: boolean;
}

export function AgentExecutionTimeline({
  execution,
  open,
  onOpenChange,
  onCancel,
  onRetry,
  onApprove,
  isActionLoading = false,
}: AgentExecutionTimelineProps) {
  const [copied, setCopied] = useState(false);

  if (!execution) return null;

  const isCompleted = execution.status === "COMPLETED";
  const isFailed = execution.status === "FAILED";
  const isCancelled = execution.status === "CANCELLED";
  const isPendingApproval = execution.status === "PENDING_APPROVAL";
  const isRunning = execution.status === "RUNNING";
  const isPending = execution.status === "PENDING";

  const canCancel = isRunning || isPending || isPendingApproval;
  const canRetry = (isFailed || isCancelled) && execution.retryCount < execution.maxRetries;
  const canApprove = isPendingApproval;

  const handleCopyJson = () => {
    // Sanitize copy content so approval token is never leaked
    const copyObj = {
      ...execution,
      approvalToken: execution.approvalToken ? "[PROTECTED_TOKEN]" : null,
    };
    navigator.clipboard.writeText(JSON.stringify(copyObj, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Persisted steps from DB or synthesized baseline if empty
  const rawSteps = execution.steps || [];
  const displaySteps =
    rawSteps.length > 0
      ? rawSteps
      : [
          {
            name: "Execution Initialized & Tenant Context Verified",
            status: "COMPLETED",
            detail: "Validated organization context and persisted record.",
          },
          {
            name: "Agent Task Processing",
            status: execution.status,
            detail: isFailed
              ? execution.error || "Execution failed during task execution"
              : isPendingApproval
              ? "Awaiting operator authorization"
              : isCompleted
              ? "Completed successfully"
              : "In progress",
          },
        ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border text-foreground rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-3 pb-3 border-b border-border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-xl font-bold tracking-tight">
                  {execution.title}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className={`text-xs font-semibold uppercase px-2.5 py-0.5 rounded-lg ${
                    isCompleted
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : isRunning
                      ? "bg-primary/10 text-primary border-primary/30 animate-pulse"
                      : isPendingApproval
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      : isCancelled
                      ? "bg-slate-500/10 text-muted-foreground border-border"
                      : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                  }`}
                >
                  {execution.status}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                <Clock className="w-3.5 h-3.5" />
                <span>Created {new Date(execution.createdAt).toLocaleString()}</span>
                {execution.startedAt && (
                  <span>• Started {new Date(execution.startedAt).toLocaleTimeString()}</span>
                )}
                {execution.completedAt && (
                  <span>• Ended {new Date(execution.completedAt).toLocaleTimeString()}</span>
                )}
                <Badge variant="outline" className="text-[10px] font-mono border-border">
                  Agent: {execution.agentType}
                </Badge>
              </DialogDescription>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyJson}
              className="text-xs h-8 gap-1.5 rounded-xl border-border"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy Record"}</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Action Controls Bar */}
        {(canCancel || canRetry || canApprove) && (
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-medium text-muted-foreground">
              {isPendingApproval ? (
                <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> This execution is waiting for approval.
                </span>
              ) : isRunning ? (
                <span>Execution is currently active and processing steps.</span>
              ) : (
                <span>This run can be restarted with incremented retry count.</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {canApprove && onApprove && (
                <Button
                  size="sm"
                  disabled={isActionLoading}
                  onClick={() => onApprove(execution)}
                  className="h-8 px-3 text-xs font-bold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
                >
                  {isActionLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Approve Run</span>
                </Button>
              )}

              {canRetry && onRetry && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isActionLoading}
                  onClick={() => onRetry(execution.id)}
                  className="h-8 px-3 text-xs font-semibold gap-1.5 border-border rounded-xl"
                >
                  {isActionLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  <span>Retry ({execution.retryCount}/{execution.maxRetries})</span>
                </Button>
              )}

              {canCancel && onCancel && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={isActionLoading}
                  onClick={() => onCancel(execution.id)}
                  className="h-8 px-3 text-xs font-semibold gap-1.5 rounded-xl"
                >
                  {isActionLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Ban className="w-3.5 h-3.5" />
                  )}
                  <span>Cancel Run</span>
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Persisted Execution Steps Timeline */}
        <div className="py-2 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Persisted Execution Steps ({displaySteps.length})
            </h4>
            <span className="text-[11px] font-mono text-muted-foreground">
              Retries: {execution.retryCount} / {execution.maxRetries}
            </span>
          </div>

          <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-border/60">
            {displaySteps.map((step, idx) => {
              const stepCompleted = step.status === "COMPLETED" || step.status === "SUCCESS";
              const stepFailed = step.status === "FAILED";
              const stepPending = step.status === "PENDING_APPROVAL";
              const stepRunning = step.status === "RUNNING";

              return (
                <div key={idx} className="relative flex items-start gap-4">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 border ${
                      stepCompleted
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                        : stepFailed
                        ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                        : stepPending
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                        : stepRunning
                        ? "bg-primary/15 border-primary/40 text-primary animate-pulse"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    {stepCompleted ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : stepFailed ? (
                      <XCircle className="w-4 h-4" />
                    ) : stepPending ? (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    ) : (
                      <Clock className="w-3.5 h-3.5" />
                    )}
                  </div>

                  <div className="flex-1 pb-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-foreground">{step.name}</p>
                      <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5 border-border">
                        {step.status}
                      </Badge>
                    </div>
                    {step.detail && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{step.detail}</p>
                    )}
                    {step.error && (
                      <p className="text-[11px] text-rose-400 font-mono">{step.error}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Error / Failure Banner */}
        {execution.error && (
          <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive space-y-1">
            <span className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Execution Error Detail
            </span>
            <p className="font-mono text-[11px] leading-relaxed break-words">{execution.error}</p>
          </div>
        )}

        {/* Input & Output Data Blocks */}
        <div className="space-y-3 pt-2 border-t border-border">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Payload Telemetry & State
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Input Payload */}
            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold">Input Payload (Sanitized)</span>
              <pre className="font-mono text-[11px] bg-muted/40 p-3 rounded-xl border border-border overflow-x-auto text-foreground/90 max-h-40">
                {JSON.stringify(execution.inputPayload || {}, null, 2)}
              </pre>
            </div>

            {/* Output Data */}
            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold">Output Data</span>
              <pre className="font-mono text-[11px] bg-muted/40 p-3 rounded-xl border border-border overflow-x-auto text-foreground/90 max-h-40">
                {JSON.stringify(execution.outputData || {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
