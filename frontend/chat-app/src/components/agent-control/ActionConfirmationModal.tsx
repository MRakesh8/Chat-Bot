import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, ShieldAlert, Loader2, CheckCircle2, Lock } from "lucide-react";
import { ConfirmationState } from "./types";

interface ActionConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmation: ConfirmationState | null;
  onConfirm: (confirmation: ConfirmationState) => Promise<void>;
  isConfirming: boolean;
}

export function ActionConfirmationModal({
  open,
  onOpenChange,
  confirmation,
  onConfirm,
  isConfirming,
}: ActionConfirmationModalProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !confirmation?.expiresAt) {
      setSecondsRemaining(null);
      return;
    }

    const calculateRemaining = () => {
      const expTime = new Date(confirmation.expiresAt!).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expTime - now) / 1000));
      return diff;
    };

    setSecondsRemaining(calculateRemaining());
    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [open, confirmation]);

  if (!confirmation) return null;

  const isExpired = secondsRemaining !== null && secondsRemaining <= 0;
  const isIrreversible = confirmation.riskLevel === "IRREVERSIBLE";

  return (
    <Dialog open={open} onOpenChange={(val) => !isConfirming && onOpenChange(val)}>
      <DialogContent className="max-w-lg bg-card border-border text-foreground rounded-2xl shadow-2xl p-6">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                isIrreversible
                  ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                  : "bg-amber-500/10 text-amber-500 border-amber-500/20"
              }`}
            >
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <span>Action Confirmation Required</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                This operation exceeds low-risk thresholds and requires explicit human verification.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Risk Level & Expiration Alert */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
              isIrreversible
                ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-400"
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <div className="text-xs font-semibold">
                Risk Classification: <span className="font-bold underline">{confirmation.riskLevel}</span>
              </div>
            </div>

            {secondsRemaining !== null && (
              <Badge
                variant="outline"
                className={`text-[11px] font-mono gap-1 px-2.5 py-0.5 ${
                  isExpired
                    ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                    : "bg-secondary text-foreground border-border"
                }`}
              >
                <Clock className="w-3 h-3" />
                {isExpired ? "Token Expired" : `${secondsRemaining}s remaining`}
              </Badge>
            )}
          </div>

          {/* Action details */}
          <div className="bg-muted/40 rounded-xl p-4 border border-border space-y-2 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground">Action Identifier</span>
              <span className="font-mono font-bold text-foreground">{confirmation.actionName}</span>
            </div>
            {confirmation.message && (
              <div className="py-1">
                <span className="text-muted-foreground block mb-1">Server Reason</span>
                <p className="text-foreground leading-relaxed italic bg-card/60 p-2.5 rounded-lg border border-border/60">
                  "{confirmation.message}"
                </p>
              </div>
            )}
            {confirmation.parameters && (
              <div className="py-1">
                <span className="text-muted-foreground block mb-1">Target Payload</span>
                <pre className="font-mono text-[11px] bg-card/90 p-2.5 rounded-lg border border-border/60 overflow-x-auto text-foreground/90 max-h-32">
                  {JSON.stringify(confirmation.parameters, null, 2)}
                </pre>
              </div>
            )}
            <div className="flex justify-between items-center pt-1 text-[11px] text-muted-foreground">
              <span>Cryptographic Token Nonce</span>
              <span className="font-mono truncate max-w-[200px]">
                {confirmation.confirmationToken.slice(0, 16)}...
              </span>
            </div>
          </div>

          {isExpired && (
            <div className="p-3 rounded-xl bg-destructive/15 text-destructive border border-destructive/30 text-xs font-medium text-center">
              The cryptographic confirmation window has lapsed. Please re-trigger the action to generate a fresh token.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isConfirming}
            className="rounded-xl text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isIrreversible ? "destructive" : "default"}
            disabled={isConfirming || isExpired}
            onClick={() => onConfirm(confirmation)}
            className={`rounded-xl text-xs gap-1.5 font-bold ${
              !isIrreversible && "bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 text-slate-950"
            }`}
          >
            {isConfirming ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying Nonce & Executing...
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" /> Authorize & Execute Action
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
