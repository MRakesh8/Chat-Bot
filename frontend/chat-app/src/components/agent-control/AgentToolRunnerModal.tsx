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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, ShieldAlert, AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import { AgentCapability, ConfirmationState } from "./types";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { apiUrl } from "@/lib/api-url";
import { useToast } from "@/hooks/use-toast";

interface AgentToolRunnerModalProps {
  tool: AgentCapability | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestConfirmation: (conf: ConfirmationState) => void;
  onExecutionSuccess: (result: any) => void;
}

export function AgentToolRunnerModal({
  tool,
  projectId,
  open,
  onOpenChange,
  onRequestConfirmation,
  onExecutionSuccess,
}: AgentToolRunnerModalProps) {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [paramsInput, setParamsInput] = useState("{}");
  const [isExecuting, setIsExecuting] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  React.useEffect(() => {
    if (tool) {
      if (tool.name.includes("get_products")) {
        setParamsInput(JSON.stringify({ limit: 5 }, null, 2));
      } else if (tool.name.includes("create_product")) {
        setParamsInput(JSON.stringify({ title: "Test Sample Product", price: "19.99" }, null, 2));
      } else if (tool.name.includes("delete_product")) {
        setParamsInput(JSON.stringify({ productId: "prod_sample_123" }, null, 2));
      } else {
        setParamsInput("{}");
      }
      setJsonError(null);
    }
  }, [tool]);

  if (!tool) return null;

  const isHighRisk = tool.riskLevel === "HIGH_RISK_WRITE" || tool.riskLevel === "IRREVERSIBLE";

  const handleExecute = async () => {
    let parsedInput: any = {};
    try {
      parsedInput = JSON.parse(paramsInput);
      setJsonError(null);
    } catch (e: any) {
      setJsonError("Invalid JSON syntax in parameters");
      return;
    }

    setIsExecuting(true);
    try {
      // Execute via the authoritative agent control endpoint
      const res = await authFetch(apiUrl("/api/agent/process"), {
        method: "POST",
        body: JSON.stringify({
          projectId,
          sessionId: `sess_runner_${Date.now()}`,
          message: `Execute tool ${tool.name} with params ${JSON.stringify(parsedInput)}`,
          actionId: tool.capabilityId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      // Check if server returned 202 or PENDING_CONFIRMATION
      if (res.status === 202 || data.data?.status === "PENDING_CONFIRMATION" || data.status === "PENDING_CONFIRMATION") {
        const confData = data.data || data;
        onOpenChange(false);
        onRequestConfirmation({
          actionId: confData.actionId || tool.capabilityId,
          actionName: confData.toolExecuted || tool.name,
          riskLevel: confData.riskLevel || tool.riskLevel,
          confirmationToken: confData.confirmationToken,
          expiresAt: confData.expiresAt,
          message: confData.response || confData.message,
          parameters: parsedInput,
        });
        return;
      }

      if (!res.ok || data.success === false) {
        throw new Error(data.error || data.data?.response || "Execution rejected by server policy");
      }

      toast({
        title: "Execution Completed",
        description: data.data?.response || `Successfully executed ${tool.name}.`,
      });
      onOpenChange(false);
      onExecutionSuccess(data.data || data);
    } catch (err: any) {
      toast({
        title: "Execution Blocked or Failed",
        description: err.message || "Failed to execute tool.",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !isExecuting && onOpenChange(val)}>
      <DialogContent className="max-w-lg bg-card border-border text-foreground rounded-2xl shadow-2xl p-6">
        <DialogHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Play className="w-5 h-5 text-primary" />
              <span>Test Tool Execution</span>
            </DialogTitle>
            <Badge
              variant="outline"
              className={`text-xs font-mono font-bold ${
                isHighRisk
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              }`}
            >
              {tool.riskLevel}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Execute <span className="font-mono font-bold text-foreground">{tool.name}</span> through the authoritative server pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isHighRisk && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                This is a high-risk write action. The backend will halt and request cryptographic confirmation before any changes take effect.
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tool-params" className="text-xs font-semibold text-foreground">
              Parameters Payload (JSON)
            </Label>
            <Textarea
              id="tool-params"
              value={paramsInput}
              onChange={(e) => {
                setParamsInput(e.target.value);
                if (jsonError) setJsonError(null);
              }}
              rows={5}
              className="font-mono text-xs bg-muted/50 border-border rounded-xl resize-none focus-visible:ring-primary/40"
              placeholder="{}"
            />
            {jsonError && <p className="text-xs text-destructive font-medium">{jsonError}</p>}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
          <Button
            type="button"
            variant="outline"
            disabled={isExecuting}
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isExecuting || tool.status !== "EXECUTABLE"}
            onClick={handleExecute}
            className="rounded-xl text-xs gap-1.5 font-bold"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Executing Pipeline...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" /> Execute Tool
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
