import { useState } from "react";
import { 
  AlertTriangle, 
  RefreshCw, 
  ExternalLink, 
  Key, 
  CheckCircle2, 
  Clock, 
  ShieldAlert, 
  Zap, 
  Check, 
  X
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROVIDER_GUIDES } from "./ProviderGuides";

export interface FixApiKeyItem {
  id: string;
  name: string;
  provider: string;
  maskedKey: string;
  status: string;
  failureReason: string | null;
  cooldownUntil: string | null;
  cooldownRemaining?: number;
  type?: "user" | "project";
  projectId?: string;
}

interface FixApiDialogProps {
  apiKey: FixApiKeyItem | null;
  isOpen: boolean;
  onClose: () => void;
  onReverify: (id: string) => Promise<void>;
  onClearCooldown: (id: string) => Promise<void>;
  onReplaceKey: (id: string, newKey: string) => Promise<void>;
}

export function FixApiDialog({
  apiKey,
  isOpen,
  onClose,
  onReverify,
  onClearCooldown,
  onReplaceKey,
}: FixApiDialogProps) {
  const [newKey, setNewKey] = useState("");
  const [isReplacing, setIsReplacing] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  if (!apiKey) return null;

  const providerGuide = PROVIDER_GUIDES.find(p => p.id === apiKey.provider.toLowerCase());
  const isCooldown = !!apiKey.cooldownUntil && new Date(apiKey.cooldownUntil).getTime() > Date.now();
  const cooldownMinutes = isCooldown 
    ? Math.ceil((new Date(apiKey.cooldownUntil!).getTime() - Date.now()) / 60000) 
    : (apiKey.cooldownRemaining || 0);

  const handleAction = async (actionName: string, fn: () => Promise<void>) => {
    try {
      setLoadingAction(actionName);
      await fn();
      if (actionName === "replace") {
        setIsReplacing(false);
        setNewKey("");
        onClose();
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const getStatusExplanation = () => {
    switch (apiKey.status) {
      case "INVALID_API_KEY":
      case "INVALID":
        return {
          title: "API Key Authentication Failed",
          desc: "The provider rejected this key (401/403). It may have been revoked, expired, mistyped, or disabled.",
          recommendedAction: "Replace this key with a freshly generated secret key from the provider console."
        };
      case "RATE_LIMIT":
      case "TOKEN_LIMIT":
      case "COOLDOWN":
        return {
          title: "Temporary Rate Limit Enforced",
          desc: "Requests per minute (RPM) or tokens per minute (TPM) limit was exceeded on your provider plan.",
          recommendedAction: isCooldown 
            ? `NOVA is cooling down requests for ~${cooldownMinutes} more minutes to prevent cascading lockouts.` 
            : "You can clear cooldown if you upgraded your rate limits or wish to re-test immediately."
        };
      case "DAILY_QUOTA":
      case "MONTHLY_CREDIT":
      case "QUOTA_EXCEEDED":
        return {
          title: "Provider Balance / Quota Depleted",
          desc: "The provider account has run out of prepaid credits or reached daily free quota caps.",
          recommendedAction: "Top up prepaid billing balance on the provider's billing dashboard, then click 'Clear Cooldown'."
        };
      case "INVALID_MODEL":
        return {
          title: "Model Unavailable on Provider Tier",
          desc: "The selected AI model is not accessible with this API key tier or in your geographic region.",
          recommendedAction: "Run Re-Verify to scan for available supported models on this key."
        };
      case "PROVIDER_DOWN":
      case "TIMEOUT":
      case "NETWORK_ERROR":
        return {
          title: "Provider Network Outage",
          desc: "The upstream AI provider experienced a temporary server error (500/502/503) or timeout.",
          recommendedAction: "Upstream outage resolved automatically. Click 'Re-verify Now' to restore active status."
        };
      default:
        return {
          title: "Key Health Degraded",
          desc: apiKey.failureReason || "The last AI request failed. Run a verification check to test connection.",
          recommendedAction: "Click 'Re-verify Now' to test live response from the provider."
        };
    }
  };

  const explanation = getStatusExplanation();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[550px] p-6 bg-card border-border">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Fix & Troubleshoot: {apiKey.name || apiKey.provider.toUpperCase()}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Masked Key: <span className="font-mono text-foreground font-semibold">{apiKey.maskedKey}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Status Breakdown Box */}
          <div className="p-4 rounded-xl bg-secondary/50 border border-border/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-500" /> {explanation.title}
              </span>
              <Badge variant="outline" className="text-[10px] font-mono uppercase bg-background">
                {apiKey.status}
              </Badge>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              {explanation.desc}
            </p>
            {apiKey.failureReason && (
              <div className="p-2.5 rounded-lg bg-background/80 border border-border/60 font-mono text-[11px] text-red-400 break-all">
                {apiKey.failureReason}
              </div>
            )}
            <div className="pt-1 text-primary flex items-start gap-1.5 font-medium">
              <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{explanation.recommendedAction}</span>
            </div>
          </div>

          {/* Cooldown notice if active */}
          {isCooldown && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 animate-spin" />
                <span>Active Safety Cooldown: <strong>{cooldownMinutes} min remaining</strong></span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={loadingAction === "cooldown"}
                onClick={() => handleAction("cooldown", () => onClearCooldown(apiKey.id))}
                className="h-7 text-[11px] border-amber-500/30 hover:bg-amber-500/20"
              >
                Clear Cooldown
              </Button>
            </div>
          )}

          {/* Replace Key Form */}
          {isReplacing ? (
            <div className="p-4 rounded-xl bg-secondary/30 border border-primary/30 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-primary" /> Enter New API Key
                </Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setIsReplacing(false)} 
                  className="h-6 px-2 text-[11px] text-muted-foreground"
                >
                  Cancel
                </Button>
              </div>
              <Input
                type="password"
                placeholder={providerGuide ? `e.g. ${providerGuide.keyPrefix}` : "Enter new secret key"}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                The replacement key will be immediately verified with {apiKey.provider.toUpperCase()} and encrypted at rest.
              </p>
              <Button
                size="sm"
                disabled={!newKey.trim() || loadingAction === "replace"}
                onClick={() => handleAction("replace", () => onReplaceKey(apiKey.id, newKey.trim()))}
                className="w-full text-xs font-semibold"
              >
                {loadingAction === "replace" ? "Verifying & Updating..." : "Verify & Save Replacement Key"}
              </Button>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 border-t border-border/50 pt-4">
          {providerGuide && (
            <a
              href={providerGuide.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors sm:mr-auto"
            >
              <span>{providerGuide.portalLabel}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {!isReplacing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReplacing(true)}
              className="text-xs"
            >
              <Key className="w-3.5 h-3.5 mr-1.5" /> Replace Key
            </Button>
          )}

          <Button
            size="sm"
            disabled={loadingAction === "verify"}
            onClick={() => handleAction("verify", () => onReverify(apiKey.id))}
            className="text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loadingAction === "verify" ? "animate-spin" : ""}`} />
            {loadingAction === "verify" ? "Testing..." : "Re-Verify Now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
