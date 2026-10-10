import React, { useState } from "react";
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
import { ShieldCheck, Lock, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { ExecutionApprovalState } from "./types";

interface ExecutionApprovalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  approvalState: ExecutionApprovalState | null;
  onApprove: (executionId: string, token?: string) => Promise<void>;
  isSubmitting: boolean;
}

export function ExecutionApprovalModal({
  open,
  onOpenChange,
  approvalState,
  onApprove,
  isSubmitting,
}: ExecutionApprovalModalProps) {
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);

  if (!approvalState) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onApprove(approvalState.executionId, tokenInput.trim() || undefined);
    setTokenInput("");
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !isSubmitting && onOpenChange(val)}>
      <DialogContent className="max-w-md bg-card border-border text-foreground rounded-2xl shadow-2xl p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  Approve Agent Execution
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Authorize this workflow execution to proceed to the next step.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Execution Title</span>
              <span className="font-semibold text-foreground truncate max-w-[200px]">
                {approvalState.title}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Agent Type</span>
              <Badge variant="outline" className="text-[10px] font-mono">
                {approvalState.agentType}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Run ID</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {approvalState.executionId.slice(0, 16)}...
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="approval-token" className="text-xs font-semibold text-foreground">
              Approval Passphrase / Token (Optional)
            </Label>
            <div className="relative">
              <Input
                id="approval-token"
                type={showToken ? "text" : "password"}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Enter approval token if configured..."
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
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              If this run was created with an approval token, enter it above. If no token was configured, leave blank to approve directly.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => {
                setTokenInput("");
                onOpenChange(false);
              }}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl text-xs gap-1.5 font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Approving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve & Resume
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
