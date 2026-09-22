import React from "react";
import { CheckCircle2, Circle, Loader2, AlertCircle, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentStepState = 
  | "NORMAL_ANSWER"
  | "ANALYSIS"
  | "PLANNING"
  | "WAITING_FOR_USER_INPUT"
  | "WAITING_FOR_CONFIRMATION"
  | "EXECUTING"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED";

export interface AgentStep {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "waiting";
  detail?: string;
}

export function AgentActivityStatus({
  agentName = "NOVA AI",
  currentState,
  steps = [],
  className,
}: {
  agentName?: string;
  currentState?: AgentStepState;
  steps?: AgentStep[];
  className?: string;
}) {
  if (!currentState && steps.length === 0) return null;

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-3.5 shadow-xs max-w-md my-2 text-xs space-y-2.5", className)}>
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>{agentName}</span>
        </div>
        {currentState && (
          <span className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-medium border uppercase tracking-wider",
            currentState === "COMPLETED" && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
            currentState === "FAILED" && "bg-rose-500/10 text-rose-600 border-rose-500/20",
            currentState === "WAITING_FOR_CONFIRMATION" && "bg-amber-500/10 text-amber-600 border-amber-500/20",
            (currentState === "EXECUTING" || currentState === "VERIFYING" || currentState === "ANALYSIS" || currentState === "PLANNING") && "bg-primary/10 text-primary border-primary/20"
          )}>
            {currentState.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* Step List */}
      {steps.length > 0 && (
        <div className="space-y-1.5">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center justify-between text-muted-foreground py-0.5">
              <div className="flex items-center gap-2 min-w-0">
                {step.status === "completed" && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                )}
                {step.status === "in_progress" && (
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                )}
                {step.status === "waiting" && (
                  <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-pulse" />
                )}
                {step.status === "pending" && (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                )}
                {step.status === "failed" && (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                )}
                <span className={cn("truncate font-medium", step.status === "completed" && "text-foreground")}>
                  {step.label}
                </span>
              </div>
              {step.detail && (
                <span className="text-[10px] text-muted-foreground/80 truncate ml-2 font-mono">
                  {step.detail}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
