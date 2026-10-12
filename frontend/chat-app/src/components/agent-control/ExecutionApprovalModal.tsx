import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Ban,
  Layers,
} from "lucide-react";
import { ExecutionApprovalState } from "./types";

interface ExecutionApprovalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  approvalState: ExecutionApprovalState | null;
  onApprove: (executionId: string, token?: string) => Promise<void>;
  onReject?: (executionId: string, reason?: string) => Promise<void>;
  isSubmitting: boolean;
}

export function ExecutionApprovalModal({
  open,
  onOpenChange,
  approvalState,
  onApprove,
  onReject,
  isSubmitting,
}: ExecutionApprovalModalProps) {
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (approvalState?.confirmationToken) {
      setTokenInput(approvalState.confirmationToken);
    } else {
      setTokenInput("");
    }
    setShowToken(false);
    setRejectReason("");
    setIsRejecting(false);

    if (!open || !approvalState?.expiresAt) {
      setSecondsRemaining(null);
      return;
    }

    const calcRemaining = () => {
      const exp = new Date(approvalState.expiresAt!).getTime();
      return Math.max(0, Math.floor((exp - Date.now()) / 1000));
    };

    setSecondsRemaining(calcRemaining());
    const timer = setInterval(() => {
      const rem = calcRemaining();
      setSecondsRemaining(rem);
      if (rem <= 0) clearInterval(timer);
    }, 1000);

    return () => clearInterval(timer);
  }, [approvalState?.executionId, approvalState?.confirmationToken, approvalState?.expiresAt, open]);

  if (!approvalState) return null;

  const isExpired = secondsRemaining !== null && secondsRemaining <= 0;
  const isHighRisk = approvalState.riskLevel === "HIGH_RISK_WRITE" || approvalState.riskLevel === "IRREVERSIBLE";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) return;
    await onApprove(approvalState.executionId, tokenInput.trim() || undefined);
  };

  const handleRejectClick = async () => {
    if (!onReject) return;
    await onReject(
      approvalState.executionId,
      rejectReason.trim() || "Action rejected by human operator"
    );
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !isSubmitting && onOpenChange(val)}>
      <DialogContent className="max-w-lg bg-card border-border text-foreground rounded-2xl shadow-2xl p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                  isHighRisk
                    ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                    : "bg-primary/10 text-primary border-primary/20"
                }`}
              >
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-lg font-bold">
                    Consequential Action Authorization
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold uppercase ${
                      approvalState.riskLevel === "IRREVERSIBLE"
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    }`}
                  >
                    {approvalState.riskLevel || "HIGH_RISK_WRITE"}
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  An AI agent workflow is paused at a consequential action threshold requiring explicit approval.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Action Details & Impact Assessment */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/80 space-y-2.5 text-xs">
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground font-medium">Workflow Task</span>
              <span className="font-semibold text-foreground truncate max-w-[240px]">
                {approvalState.title}
              </span>
            </div>

            {approvalState.actionType && (
              <div className="flex justify-between items-center gap-2">
                <span className="text-muted-foreground font-medium">Tool / Action</span>
                <Badge variant="outline" className="font-mono text-[11px] bg-card border-border">
                  {approvalState.actionType}
                </Badge>
              </div>
            )}

            {approvalState.stepDescription && (
              <div className="space-y-1 pt-1 border-t border-border/40">
                <span className="text-muted-foreground font-medium">Planned Action Detail</span>
                <p className="font-semibold text-foreground leading-relaxed">
                  {approvalState.stepDescription}
                </p>
              </div>
            )}

            {/* Parameters Table if present */}
            {approvalState.parameters && Object.keys(approvalState.parameters).length > 0 && (
              <div className="space-y-1 pt-1 border-t border-border/40">
                <span className="text-muted-foreground font-medium">Target Parameters</span>
                <pre className="font-mono text-[10px] bg-background/80 p-2.5 rounded-lg border border-border/60 overflow-x-auto text-foreground/90 max-h-28">
                  {JSON.stringify(approvalState.parameters, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Expiration Countdown & Impact Warning */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
              isExpired
                ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-300"
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">
                  {isExpired ? "Approval Token Expired" : "State Mutation Guard"}
                </span>
                {secondsRemaining !== null && !isExpired && (
                  <span className="font-mono text-[11px] font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {secondsRemaining}s remaining
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed opacity-90">
                {isExpired
                  ? "This approval token has expired. Cancel this run or trigger a fresh workflow to generate a new valid token."
                  : "Approving will resume execution and apply changes with live integration credentials. Verify all parameters above before authorizing."}
              </p>
            </div>
          </div>

          {/* Cryptographic Token Input */}
          <div className="space-y-1.5">
            <Label htmlFor="approval-token" className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Cryptographic Confirmation Token</span>
              {tokenInput && (
                <span className="text-[10px] text-emerald-400 font-mono">HMAC Token Attached</span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="approval-token"
                type={showToken ? "text" : "password"}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                disabled={isSubmitting || isExpired}
                placeholder="Token auto-attached from execution state..."
                className="pr-10 bg-muted/40 border-border text-xs rounded-xl h-9 font-mono"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title={showToken ? "Hide token" : "Show token"}
              >
                {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-2 pt-2 border-t border-border">
            {onReject && (
              <Button
                type="button"
                variant="destructive"
                disabled={isSubmitting}
                onClick={handleRejectClick}
                className="rounded-xl text-xs gap-1.5 font-semibold sm:mr-auto"
              >
                <Ban className="w-3.5 h-3.5" /> Reject Action
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs"
            >
              Close
            </Button>

            <Button
              type="submit"
              disabled={isSubmitting || isExpired}
              className="rounded-xl text-xs gap-1.5 font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Authorizing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Authorize & Resume
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
