import { useState } from "react";
import { 
  FolderOpen, 
  Key, 
  Plus, 
  Trash2, 
  Star, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  Cpu, 
  Zap, 
  Layers, 
  Activity, 
  Wrench,
  Bot
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

export interface ProjectApiKey {
  id: string;
  name: string;
  provider: string;
  maskedKey: string;
  model?: string;
  isPrimary: boolean;
  isEnabled: boolean;
  status: string;
  availableModels?: string[];
  lastSuccess: string | null;
  lastFailure: string | null;
  failureReason: string | null;
  cooldownUntil: string | null;
  cooldownRemaining?: number;
  createdAt: string;
}

export interface ProjectOption {
  id: string;
  name: string;
  description?: string;
}

interface ProjectApiKeysTabProps {
  projects: ProjectOption[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  keys: ProjectApiKey[];
  loading: boolean;
  onAddKey: (projectId: string, data: { apiKey: string; name?: string }) => Promise<void>;
  onDeleteKey: (projectId: string, keyId: string) => Promise<void>;
  onVerifyKey: (projectId: string, keyId: string) => Promise<void>;
  onUpdateModel: (projectId: string, keyId: string, model: string) => Promise<void>;
  onToggleEnabled: (projectId: string, keyId: string, currentlyEnabled: boolean) => Promise<void>;
  onSetPrimary: (projectId: string, keyId: string) => Promise<void>;
  onClearCooldown: (projectId: string, keyId: string) => Promise<void>;
  onReplaceKey: (projectId: string, keyId: string, newKey: string) => Promise<void>;
}

export function ProjectApiKeysTab({
  projects,
  selectedProjectId,
  onSelectProject,
  keys,
  loading,
  onAddKey,
  onDeleteKey,
  onVerifyKey,
  onUpdateModel,
  onToggleEnabled,
  onSetPrimary,
  onClearCooldown,
  onReplaceKey,
}: ProjectApiKeysTabProps) {
  const [apiKey, setApiKey] = useState("");
  const [name, setName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [keyToDelete, setKeyToDelete] = useState<ProjectApiKey | null>(null);
  const [keyToFix, setKeyToFix] = useState<FixApiKeyItem | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const activeProject = projects.find(p => p.id === selectedProjectId);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || !selectedProjectId) return;
    setIsAdding(true);
    setFormError(null);
    try {
      await onAddKey(selectedProjectId, {
        apiKey: apiKey.trim(),
        name: name.trim() || undefined,
      });
      setApiKey("");
      setName("");
    } catch (err: any) {
      setFormError(err.message || "Failed to add project API key.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleVerify = async (keyId: string) => {
    if (!selectedProjectId) return;
    setVerifyingId(keyId);
    try {
      await onVerifyKey(selectedProjectId, keyId);
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
      {/* Project Selector Header */}
      <Card className="bg-card border-border shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-primary" /> Target Project
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Select the project to configure dedicated website widget & agent credentials.
              </CardDescription>
            </div>

            {projects.length > 0 && (
              <select
                value={selectedProjectId}
                onChange={(e) => onSelectProject(e.target.value)}
                className="bg-secondary border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer min-w-[220px]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Add Project Key Form */}
      {selectedProjectId && (
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" /> Add Project AI Credential
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              These credentials directly power the public customer widget and autonomous tools for {activeProject?.name || "this project"}.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-foreground">Credential Label</Label>
                  <Input
                    type="text"
                    placeholder="e.g. Widget Gemini Production"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-foreground">API Key</Label>
                  <Input
                    type="password"
                    placeholder="Paste Gemini, OpenAI, Claude, or Groq key..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="mt-1.5 text-xs font-mono"
                    required
                  />
                </div>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-end pt-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!apiKey.trim() || isAdding}
                  className="text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  {isAdding ? "Verifying & Adding..." : "Verify & Add Project Key"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Project Keys List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" /> Active Project Credentials ({keys.length})
          </h3>
        </div>

        {keys.length === 0 ? (
          <div className="p-8 rounded-2xl bg-card border border-border text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Key className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">No Project-Specific Keys Configured</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              This project will use your global user API keys or platform system credits by default. Add a project key above to isolate usage and configure custom widget models.
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
                      {/* Left: Info & Model Selector */}
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
                                  Primary Widget Model
                                </Badge>
                              )}
                              {getStatusBadge(k.status, k.isEnabled)}
                            </div>
                            <span className="text-xs font-mono text-muted-foreground">{k.maskedKey}</span>
                          </div>
                        </div>

                        {/* Model Selection Dropdown */}
                        <div className="flex items-center gap-3 pt-1">
                          <span className="text-xs text-muted-foreground font-medium">Assigned Model:</span>
                          {k.availableModels && k.availableModels.length > 0 ? (
                            <select
                              value={k.model || k.availableModels[0]}
                              onChange={(e) => onUpdateModel(selectedProjectId, k.id, e.target.value)}
                              className="bg-secondary/70 border border-border rounded-lg px-2.5 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
                            >
                              {k.availableModels.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Badge variant="outline" className="text-xs font-mono bg-secondary/40">
                              {k.model || "Default Model"}
                            </Badge>
                          )}
                        </div>

                        {/* Failure reason if any */}
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
                            onClick={() => setKeyToFix({ ...k, type: "project", projectId: selectedProjectId })}
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
                            onClick={() => onSetPrimary(selectedProjectId, k.id)}
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Star className="w-3.5 h-3.5 mr-1" /> Make Primary
                          </Button>
                        )}

                        <div className="flex items-center gap-2 px-2">
                          <Switch
                            checked={k.isEnabled}
                            onCheckedChange={() => onToggleEnabled(selectedProjectId, k.id, k.isEnabled)}
                            aria-label="Toggle project key"
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
            <AlertDialogTitle className="text-base font-semibold">Delete Project API Key?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete <strong className="text-foreground">{keyToDelete?.name}</strong>? 
              Customer chat widget requests will fall back to workspace keys or system defaults.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (keyToDelete && selectedProjectId) {
                  onDeleteKey(selectedProjectId, keyToDelete.id);
                  setKeyToDelete(null);
                }
              }}
              className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold"
            >
              Delete Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fix API Dialog */}
      <FixApiDialog
        apiKey={keyToFix}
        isOpen={!!keyToFix}
        onClose={() => setKeyToFix(null)}
        onReverify={async () => {
          if (keyToFix && selectedProjectId) {
            await onVerifyKey(selectedProjectId, keyToFix.id);
            setKeyToFix(null);
          }
        }}
        onClearCooldown={async () => {
          if (keyToFix && selectedProjectId) {
            await onClearCooldown(selectedProjectId, keyToFix.id);
            setKeyToFix(null);
          }
        }}
        onReplaceKey={async (_, newKey) => {
          if (keyToFix && selectedProjectId) {
            await onReplaceKey(selectedProjectId, keyToFix.id, newKey);
          }
        }}
      />
    </div>
  );
}
