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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  FileCheck2,
  HelpCircle,
  ArrowRight,
  ExternalLink,
  Zap,
} from "lucide-react";
import { AgentExecutionRecord, ExecutionStep, VerificationStatus } from "./types";

interface AgentExecutionTimelineProps {
  execution: AgentExecutionRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel?: (executionId: string) => void;
  onRetry?: (executionId: string) => void;
  onApprove?: (execution: AgentExecutionRecord) => void;
  isActionLoading?: boolean;
}

function formatDuration(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  if (diffMs < 1000) return `${diffMs}ms`;
  const secs = (diffMs / 1000).toFixed(1);
  return `${secs}s`;
}

function getRecoveryGuidance(error?: string | null, status?: string): { title: string; advice: string } | null {
  if (!error && status !== "FAILED" && status !== "CANCELLED") return null;

  const errStr = (error || "").toLowerCase();

  if (errStr.includes("rate limit") || errStr.includes("429")) {
    return {
      title: "Rate Limit Exceeded (HTTP 429)",
      advice: "The upstream provider is experiencing high traffic. Retry after a 60-second cooldown period or decrease batch sizes.",
    };
  }
  if (errStr.includes("unauthorized") || errStr.includes("401") || errStr.includes("forbidden") || errStr.includes("403")) {
    return {
      title: "Authentication / Authorization Guard",
      advice: "Verify integration credentials and check that the user has appropriate permissions in Project Settings.",
    };
  }
  if (errStr.includes("quota") || errStr.includes("entitlement")) {
    return {
      title: "Usage Quota or Subscription Limit",
      advice: "Your project action execution quota or subscription has been reached. Upgrade project tier in Billing.",
    };
  }
  if (errStr.includes("cancelled") || status === "CANCELLED") {
    return {
      title: "Execution Cancelled by User",
      advice: "The run was terminated before completing all steps. Any steps that completed before cancellation remain intact. You can safely retry if needed.",
    };
  }
  if (errStr.includes("timeout") || errStr.includes("timed out") || errStr.includes("etimedout")) {
    return {
      title: "Network Timeout",
      advice: "The request exceeded the bounded execution deadline (15s). Safe to retry for idempotent and read operations.",
    };
  }
  if (errStr.includes("schema") || errStr.includes("invalid_input") || errStr.includes("missing required")) {
    return {
      title: "Input Schema Validation Failure",
      advice: "Required parameters were missing or malformed. Ensure the task prompt provides all required entity identifiers.",
    };
  }

  return {
    title: "Execution Error",
    advice: "Check step telemetry below for detailed error responses. If transient, click Retry to restart with an incremented attempt count.",
  };
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
  const [activeTab, setActiveTab] = useState<"steps" | "telemetry" | "recovery">("steps");

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
    const copyObj = {
      ...execution,
      approvalToken: execution.approvalToken ? "[PROTECTED_TOKEN]" : null,
    };
    navigator.clipboard.writeText(JSON.stringify(copyObj, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rawSteps = execution.steps || [];
  const displaySteps: ExecutionStep[] =
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

  const completedStepsCount = displaySteps.filter(
    (s) => s.status === "COMPLETED" || s.status === "SUCCESS"
  ).length;

  const totalStepsCount = displaySteps.length;
  const progressPercent =
    totalStepsCount > 0 ? Math.round((completedStepsCount / totalStepsCount) * 100) : 0;

  const isDemo = execution.id.startsWith("demo-") || execution.projectId === "demo-project";
  const guidance = getRecoveryGuidance(execution.error, execution.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-card border-border text-foreground rounded-2xl shadow-2xl p-6 max-h-[92vh] overflow-y-auto">
        <DialogHeader className="space-y-3 pb-3 border-b border-border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-xl font-bold tracking-tight truncate max-w-[480px]">
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
                {isDemo && (
                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                    🧪 Demo Simulation
                  </Badge>
                )}
              </div>

              <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2.5 flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Created {new Date(execution.createdAt).toLocaleTimeString()}</span>
                </span>
                {execution.startedAt && (
                  <span>• Duration: {formatDuration(execution.startedAt, execution.completedAt)}</span>
                )}
                <Badge variant="outline" className="text-[10px] font-mono border-border">
                  Agent: {execution.agentType}
                </Badge>
                <span className="text-muted-foreground font-mono text-[11px]">
                  ID: {execution.id.slice(0, 12)}...
                </span>
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

          {/* Workflow Progress Bar */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Workflow Progress: {completedStepsCount} of {totalStepsCount} steps completed
              </span>
              <span className="font-mono text-[11px] font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  isCompleted
                    ? "bg-emerald-500"
                    : isFailed
                    ? "bg-rose-500"
                    : isCancelled
                    ? "bg-slate-400"
                    : isPendingApproval
                    ? "bg-amber-400"
                    : "bg-primary"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </DialogHeader>

        {/* Action Controls Bar */}
        {(canCancel || canRetry || canApprove) && (
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-medium text-muted-foreground">
              {isPendingApproval ? (
                <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> This execution is waiting for human authorization.
                </span>
              ) : isRunning ? (
                <span>Execution is currently active and processing steps.</span>
              ) : (
                <span>This run can be restarted with an incremented attempt counter.</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {canApprove && onApprove && (
                <Button
                  size="sm"
                  disabled={isActionLoading}
                  onClick={() => onApprove(execution)}
                  className="h-8 px-3.5 text-xs font-bold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-xs"
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

        {/* Tabbed Navigation */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid grid-cols-3 bg-muted/40 p-1 rounded-xl h-9">
            <TabsTrigger value="steps" className="text-xs font-semibold rounded-lg data-[state=active]:bg-card">
              Planned Steps ({displaySteps.length})
            </TabsTrigger>
            <TabsTrigger value="telemetry" className="text-xs font-semibold rounded-lg data-[state=active]:bg-card">
              Telemetry & State
            </TabsTrigger>
            <TabsTrigger value="recovery" className="text-xs font-semibold rounded-lg data-[state=active]:bg-card">
              Recovery Guidance {guidance ? "(!)" : ""}
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: STEPS & VERIFICATION TIMELINE */}
          <TabsContent value="steps" className="space-y-4 pt-3">
            <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-border/60">
              {displaySteps.map((step, idx) => {
                const stepCompleted = step.status === "COMPLETED" || step.status === "SUCCESS";
                const stepFailed = step.status === "FAILED";
                const stepPending = step.status === "PENDING_APPROVAL";
                const stepRunning = step.status === "RUNNING";
                const stepSkipped = step.status === "SKIPPED";
                const verification = step.verification;

                return (
                  <div key={idx} className="relative flex items-start gap-4">
                    {/* Status Circle Icon */}
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
                          : stepSkipped
                          ? "bg-slate-500/15 border-slate-500/40 text-slate-400"
                          : "bg-muted border-border text-muted-foreground"
                      }`}
                    >
                      {stepCompleted ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : stepFailed ? (
                        <XCircle className="w-4 h-4" />
                      ) : stepPending ? (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      ) : stepSkipped ? (
                        <Ban className="w-3.5 h-3.5" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                    </div>

                    {/* Step Content Card */}
                    <div className="flex-1 p-3.5 rounded-xl bg-card border border-border/80 shadow-xs space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[11px] text-muted-foreground font-bold">
                            #{idx + 1} {step.stepId ? `[${step.stepId}]` : ""}
                          </span>
                          <span className="text-xs font-bold text-foreground">
                            {step.name || step.actionType || "Workflow Step"}
                          </span>

                          {step.riskLevel && (
                            <Badge
                              variant="outline"
                              className={`text-[9px] font-bold uppercase py-0 px-1.5 ${
                                step.riskLevel === "IRREVERSIBLE"
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                  : step.riskLevel === "HIGH_RISK_WRITE"
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                  : step.riskLevel === "LOW_RISK_WRITE"
                                  ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                  : "bg-slate-500/10 text-slate-400 border-slate-500/30"
                              }`}
                            >
                              {step.riskLevel}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {step.durationMs !== undefined && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {step.durationMs}ms
                            </span>
                          )}
                          <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5 border-border">
                            {step.status}
                          </Badge>
                        </div>
                      </div>

                      {step.description && step.description !== step.name && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {step.description}
                        </p>
                      )}

                      {step.detail && step.detail !== step.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {step.detail}
                        </p>
                      )}

                      {/* Dependencies and Input Mappings */}
                      {(step.dependsOn?.length || step.inputMapping) && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-muted-foreground">
                          {step.dependsOn && step.dependsOn.length > 0 && (
                            <span className="flex items-center gap-1">
                              <span className="font-semibold text-foreground/80">Prerequisites:</span>
                              {step.dependsOn.map((dep, dIdx) => (
                                <Badge key={dIdx} variant="outline" className="text-[9px] font-mono py-0 px-1 bg-muted/60">
                                  {dep}
                                </Badge>
                              ))}
                            </span>
                          )}

                          {step.inputMapping && Object.keys(step.inputMapping).length > 0 && (
                            <span className="flex items-center gap-1">
                              <span className="font-semibold text-foreground/80">Input Mapping:</span>
                              {Object.entries(step.inputMapping).map(([k, v], mIdx) => (
                                <Badge key={mIdx} variant="outline" className="text-[9px] font-mono py-0 px-1 bg-muted/60">
                                  {k} ← {v}
                                </Badge>
                              ))}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Authoritative State Verification Result */}
                      {verification && (
                        <div
                          className={`mt-2 p-2.5 rounded-lg border text-xs space-y-1 ${
                            verification.status === "SUCCEEDED"
                              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                              : verification.status === "FAILED"
                              ? "bg-rose-500/10 border-rose-500/25 text-rose-300"
                              : verification.status === "PARTIALLY_COMPLETED"
                              ? "bg-blue-500/10 border-blue-500/25 text-blue-300"
                              : "bg-amber-500/10 border-amber-500/25 text-amber-300"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold flex items-center gap-1.5">
                              <FileCheck2 className="w-3.5 h-3.5" />
                              Verification Outcome: {verification.status}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[9px] font-bold ${
                                verification.verified
                                  ? "border-emerald-500/40 text-emerald-400"
                                  : "border-amber-500/40 text-amber-400"
                              }`}
                            >
                              {verification.verified ? "Authoritatively Verified" : "Unverified"}
                            </Badge>
                          </div>

                          {verification.reason && (
                            <p className="text-[11px] leading-relaxed opacity-90">
                              {verification.reason}
                            </p>
                          )}

                          {verification.evidence && Object.keys(verification.evidence).length > 0 && (
                            <div className="pt-1 flex flex-wrap gap-2 text-[10px] font-mono">
                              <span className="font-semibold">Evidence:</span>
                              {Object.entries(verification.evidence).map(([ek, ev], eIdx) => (
                                <span key={eIdx} className="bg-background/50 px-1.5 py-0.5 rounded border border-border/40">
                                  {ek}: {typeof ev === "object" ? JSON.stringify(ev) : String(ev)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Step Error */}
                      {step.error && (
                        <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
                          {step.error}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* TAB 2: TELEMETRY & PAYLOADS */}
          <TabsContent value="telemetry" className="space-y-4 pt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1.5">
                <span className="text-muted-foreground font-semibold flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" /> Input Payload (Sanitized)
                </span>
                <pre className="font-mono text-[11px] bg-muted/40 p-3 rounded-xl border border-border overflow-x-auto text-foreground/90 max-h-56">
                  {JSON.stringify(execution.inputPayload || {}, null, 2)}
                </pre>
              </div>

              <div className="space-y-1.5">
                <span className="text-muted-foreground font-semibold flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> Output Data & Verification
                </span>
                <pre className="font-mono text-[11px] bg-muted/40 p-3 rounded-xl border border-border overflow-x-auto text-foreground/90 max-h-56">
                  {JSON.stringify(execution.outputData || {}, null, 2)}
                </pre>
              </div>
            </div>

            {execution.approvalToken && (
              <div className="p-3 rounded-xl bg-card border border-border/80 flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Approval Token Status</span>
                <Badge variant="outline" className="font-mono text-[10px] text-emerald-400 border-emerald-500/30">
                  Cryptographic Token Generated & Validated
                </Badge>
              </div>
            )}
          </TabsContent>

          {/* TAB 3: RECOVERY GUIDANCE */}
          <TabsContent value="recovery" className="space-y-3 pt-3">
            {guidance ? (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{guidance.title}</span>
                </div>
                <p className="text-foreground leading-relaxed">{guidance.advice}</p>
                {execution.error && (
                  <div className="pt-2 border-t border-destructive/20 font-mono text-[11px] text-destructive/90 break-words">
                    Raw Diagnostic: {execution.error}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center space-y-2 text-xs text-muted-foreground bg-muted/20 rounded-xl border border-border">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400" />
                <p className="font-semibold text-foreground">No Failures Detected</p>
                <p>This workflow run is operating within normal reliability parameters.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
