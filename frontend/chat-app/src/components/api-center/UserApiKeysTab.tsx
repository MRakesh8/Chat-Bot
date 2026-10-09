import { useState } from "react";
import { 
  Key, 
  Plus, 
  Trash2, 
  Star, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ShieldCheck, 
  Activity, 
  Sparkles, 
  Zap, 
  Layers, 
  Cpu, 
  Sliders, 
  HelpCircle,
  Wrench
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FixApiDialog, FixApiKeyItem } from "./FixApiDialog";
import { PROVIDER_GUIDES } from "./ProviderGuides";

export interface UserApiKey {
  id: string;
  name: string;
  provider: string;
  maskedKey: string;
  isPrimary: boolean;
  isEnabled: boolean;
  status: string;
  healthScore: number;
  latencyMs: number;
  totalRequests: number;
  totalFailures: number;
  tokensToday: number;
  availableModels: string[];
  lastSuccess: string | null;
  lastFailure: string | null;
  failureReason: string | null;
  cooldownUntil: string | null;
  cooldownRemaining: number;
  createdAt: string;
}

interface UserApiKeysTabProps {
  keys: UserApiKey[];
  apiMode: string;
  loading: boolean;
  onAddKey: (data: { apiKey: string; name?: string; provider?: string }) => Promise<void>;
  onDeleteKey: (id: string) => Promise<void>;
  onVerifyKey: (id: string) => Promise<void>;
  onToggleEnabled: (id: string, currentlyEnabled: boolean) => Promise<void>;
  onSetPrimary: (id: string) => Promise<void>;
  onClearCooldown: (id: string) => Promise<void>;
  onReplaceKey: (id: string, newKey: string) => Promise<void>;
  onModeChange: (mode: string) => Promise<void>;
  onValidateKey: (apiKey: string, provider?: string) => Promise<{ valid: boolean; provider: string; defaultModel: string; models: string[]; error?: string }>;
}

export function UserApiKeysTab({
  keys,
  apiMode,
  loading,
  onAddKey,
  onDeleteKey,
  onVerifyKey,
  onToggleEnabled,
  onSetPrimary,
  onClearCooldown,
  onReplaceKey,
  onModeChange,
  onValidateKey,
}: UserApiKeysTabProps) {
  // Add form state
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("auto");
  const [isAdding, setIsAdding] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; provider: string; defaultModel: string; models: string[]; error?: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Dialog states
  const [keyToDelete, setKeyToDelete] = useState<UserApiKey | null>(null);
  const [keyToFix, setKeyToFix] = useState<FixApiKeyItem | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!newKey.trim()) return;
    setIsValidating(true);
    setFormError(null);
    setValidationResult(null);
    try {
      const result = await onValidateKey(newKey.trim(), selectedProvider === "auto" ? undefined : selectedProvider);
      setValidationResult(result);
      if (!result.valid) {
        setFormError(result.error || "Key validation failed.");
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to test key with provider.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    setIsAdding(true);
    setFormError(null);
    try {
      await onAddKey({
        apiKey: newKey.trim(),
        name: newName.trim() || undefined,
        provider: selectedProvider === "auto" ? undefined : selectedProvider,
      });
      setNewKey("");
      setNewName("");
      setValidationResult(null);
    } catch (err: any) {
      setFormError(err.message || "Failed to add API key.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      await onVerifyKey(id);
    } finally {
      setVerifyingId(null);
    }
  };

  const getStatusBadge = (status: string, isEnabled: boolean) => {
    if (!isEnabled) {
      return (
        <Badge variant="outline" className="text-[11px] bg-secondary/60 text-muted-foreground border-border flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" /> Disabled
        </Badge>
      );
    }
    if (status === "HEALTHY") {
      return (
        <Badge variant="outline" className="text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Healthy
        </Badge>
      );
    }
    if (["RATE_LIMIT", "TOKEN_LIMIT", "COOLDOWN"].includes(status)) {
      return (
        <Badge variant="outline" className="text-[11px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" /> {status.replace("_", " ")}
        </Badge>
      );
    }
    if (["DAILY_QUOTA", "MONTHLY_CREDIT", "QUOTA_EXCEEDED"].includes(status)) {
      return (
        <Badge variant="outline" className="text-[11px] bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-500" /> Quota Exhausted
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[11px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-red-500" /> {status.replace("_", " ")}
      </Badge>
    );
  };

  const getProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
      case "gemini": return <Sparkles className="w-4 h-4 text-blue-400" />;
      case "openai": return <Cpu className="w-4 h-4 text-emerald-400" />;
      case "claude": return <Zap className="w-4 h-4 text-amber-400" />;
      case "groq": return <Zap className="w-4 h-4 text-orange-400" />;
      case "openrouter": return <Layers className="w-4 h-4 text-purple-400" />;
      default: return <Key className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Workspace Routing Mode Setting */}
      <Card className="bg-card border-border shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary" /> AI Provider Routing Mode
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Configure how NOVA resolves AI credentials across your platform chats and assistant queries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: "auto", title: "Smart Auto (Recommended)", desc: "Uses your primary user key, seamlessly failing over to healthy providers." },
              { id: "user_first", title: "User Keys First", desc: "Always attempts your configured user keys before any system fallbacks." },
              { id: "system_first", title: "System Pool First", desc: "Uses platform system credentials when available, preserving your personal quota." },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onModeChange(mode.id)}
                className={`p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                  apiMode === mode.id
                    ? "bg-primary/10 border-primary/40 shadow-xs"
                    : "bg-secondary/30 border-border hover:bg-secondary/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{mode.title}</span>
                  {apiMode === mode.id && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{mode.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add New Key Section */}
      <Card className="bg-card border-border shadow-xs">
        <CardHeader className="pb-4 border-b border-border/50">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Add AI Provider API Key
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Connect Gemini, OpenAI, Claude, Groq, or OpenRouter. Keys are verified live and encrypted with AES-256-GCM.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleAddSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs font-semibold text-foreground">Target Provider</Label>
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  className="w-full mt-1.5 bg-secondary border border-border rounded-xl px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  <option value="auto">⚡ Auto-Detect from Key Prefix</option>
                  <option value="gemini">Google Gemini (AIza...)</option>
                  <option value="openai">OpenAI (sk-proj-... / sk-...)</option>
                  <option value="claude">Anthropic Claude (sk-ant-...)</option>
                  <option value="groq">Groq Cloud (gsk_...)</option>
                  <option value="openrouter">OpenRouter (sk-or-...)</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-foreground">Key Label (Optional)</Label>
                <Input
                  type="text"
                  placeholder="e.g. My Production Gemini"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1.5 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-foreground">Secret API Key</Label>
                <Input
                  type="password"
                  placeholder="Paste raw API key..."
                  value={newKey}
                  onChange={(e) => {
                    setNewKey(e.target.value);
                    setValidationResult(null);
                  }}
                  className="mt-1.5 text-xs font-mono"
                  required
                />
              </div>
            </div>

            {/* Validation Feedback */}
            {validationResult && (
              <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                validationResult.valid 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" 
                  : "bg-red-500/10 border-red-500/30 text-red-500"
              }`}>
                <div className="flex items-center gap-2">
                  {validationResult.valid ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  <span>
                    {validationResult.valid 
                      ? `Connection verified with ${validationResult.provider.toUpperCase()}. Unlocked models: ${validationResult.models.slice(0, 3).join(", ")}...` 
                      : validationResult.error}
                  </span>
                </div>
              </div>
            )}

            {formError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Stored keys are masked and never exposed in plaintext.
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!newKey.trim() || isValidating}
                  onClick={handleValidate}
                  className="text-xs flex-1 sm:flex-none"
                >
                  <Activity className={`w-3.5 h-3.5 mr-1.5 ${isValidating ? "animate-spin" : ""}`} />
                  {isValidating ? "Testing Connection..." : "Test Key"}
                </Button>

                <Button
                  type="submit"
                  size="sm"
                  disabled={!newKey.trim() || isAdding}
                  className="text-xs font-semibold flex-1 sm:flex-none"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  {isAdding ? "Adding..." : "Add & Verify Key"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Configured Keys List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" /> Configured User API Keys ({keys.length}/5)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage personal keys for multi-provider routing and direct model access.
            </p>
          </div>
        </div>

        {keys.length === 0 ? (
          <div className="p-8 rounded-2xl bg-card border border-border text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Key className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">No User API Keys Configured</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Add your Google Gemini, OpenAI, or Claude API keys above to run chats using your personal provider quotas and custom models.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {keys.map((k) => {
              const isFailing = k.status !== "HEALTHY" && k.isEnabled;
              return (
                <Card 
                  key={k.id}
                  className={`bg-card border transition-all duration-200 ${
                    k.isPrimary ? "border-primary/50 shadow-xs" : "border-border"
                  }`}
                >
                  <CardContent className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: Info & Status */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center">
                            {getProviderIcon(k.provider)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-foreground">{k.name}</span>
                              {k.isPrimary && (
                                <Badge variant="secondary" className="text-[10px] bg-primary/15 text-primary border-0 font-semibold px-2 py-0.5">
                                  Primary
                                </Badge>
                              )}
                              {getStatusBadge(k.status, k.isEnabled)}
                            </div>
                            <span className="text-xs font-mono text-muted-foreground">{k.maskedKey}</span>
                          </div>
                        </div>

                        {/* Health & Metrics Bar */}
                        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground pt-1">
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3 text-primary" />
                            Health: <strong className="text-foreground">{k.healthScore}%</strong>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            Latency: <strong className="text-foreground">{k.latencyMs > 0 ? `${k.latencyMs}ms` : "<100ms"}</strong>
                          </span>
                          <span>Requests: <strong className="text-foreground">{k.totalRequests}</strong></span>
                          <span>Failures: <strong className="text-foreground">{k.totalFailures}</strong></span>
                          {k.availableModels && k.availableModels.length > 0 && (
                            <span>Models: <strong className="text-foreground">{k.availableModels.length} available</strong></span>
                          )}
                        </div>

                        {/* Failure note if active */}
                        {k.failureReason && (
                          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-500 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-lg">{k.failureReason}</span>
                          </div>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex flex-wrap items-center gap-2 border-t lg:border-t-0 pt-3 lg:pt-0 border-border/50">
                        {isFailing && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setKeyToFix({ ...k, type: "user" })}
                            className="h-8 text-xs font-semibold"
                          >
                            <Wrench className="w-3.5 h-3.5 mr-1.5" /> Fix API
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={verifyingId === k.id}
                          onClick={() => handleVerify(k.id)}
                          className="h-8 text-xs"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${verifyingId === k.id ? "animate-spin" : ""}`} />
                          {verifyingId === k.id ? "Testing..." : "Verify"}
                        </Button>

                        {!k.isPrimary && k.isEnabled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSetPrimary(k.id)}
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Star className="w-3.5 h-3.5 mr-1" /> Set Primary
                          </Button>
                        )}

                        <div className="flex items-center gap-2 px-2">
                          <Switch
                            checked={k.isEnabled}
                            onCheckedChange={() => onToggleEnabled(k.id, k.isEnabled)}
                            aria-label="Toggle key active"
                          />
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setKeyToDelete(k)}
                          className="h-8 px-2 text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={!!keyToDelete} onOpenChange={(open) => !open && setKeyToDelete(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold">Delete User API Key?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete <strong className="text-foreground">{keyToDelete?.name}</strong> ({keyToDelete?.maskedKey})? 
              This will permanently remove the encrypted credential from your workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (keyToDelete) {
                  onDeleteKey(keyToDelete.id);
                  setKeyToDelete(null);
                }
              }}
              className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold"
            >
              Delete API Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fix API Dialog */}
      <FixApiDialog
        apiKey={keyToFix}
        isOpen={!!keyToFix}
        onClose={() => setKeyToFix(null)}
        onReverify={async (id) => {
          await onVerifyKey(id);
          setKeyToFix(null);
        }}
        onClearCooldown={async (id) => {
          await onClearCooldown(id);
          setKeyToFix(null);
        }}
        onReplaceKey={async (id, newKey) => {
          await onReplaceKey(id, newKey);
        }}
      />
    </div>
  );
}
