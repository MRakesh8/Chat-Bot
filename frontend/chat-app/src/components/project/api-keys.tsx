import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
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
import { 
  Loader2, 
  Key, 
  Plus, 
  Trash2, 
  Star, 
  RefreshCw, 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  BookOpen, 
  Wrench,
  Sparkles,
  Cpu,
  Zap,
  Layers,
  Bot
} from "lucide-react";
import { FixApiDialog, FixApiKeyItem } from "../api-center/FixApiDialog";
import { ProviderGuides } from "../api-center/ProviderGuides";

export function ApiKeys({ projectId }: { projectId: string }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [apiKey, setApiKey] = useState("");
  const [name, setName] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [showGuides, setShowGuides] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<any | null>(null);
  const [keyToFix, setKeyToFix] = useState<FixApiKeyItem | null>(null);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = session?.access_token;
    return fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  };

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ["project-api-keys", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys`));
      if (!res.ok) throw new Error("Failed to load api keys");
      return (await res.json()) as any[];
    },
    enabled: !!projectId,
    refetchInterval: 30000,
  });

  const addKeyMutation = useMutation({
    mutationFn: async (data: { apiKey: string; name?: string }) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys`), {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || "Failed to add key");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Added ${data.provider?.toUpperCase()} Key`, description: `Default model: ${data.model}` });
      setApiKey("");
      setName("");
      queryClient.invalidateQueries({ queryKey: ["project-api-keys", projectId] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to add API key", description: err.message, variant: "destructive" });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys/${keyId}`), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete key");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "API Key deleted" });
      queryClient.invalidateQueries({ queryKey: ["project-api-keys", projectId] });
    },
    onError: () => {
      toast({ title: "Failed to delete API key", variant: "destructive" });
    },
  });

  const updateModelMutation = useMutation({
    mutationFn: async ({ keyId, model }: { keyId: string; model: string }) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys/${keyId}`), {
        method: "PUT",
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error("Failed to update model");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Model updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["project-api-keys", projectId] });
    },
    onError: () => {
      toast({ title: "Failed to update model", variant: "destructive" });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ keyId, action, method = "PATCH", body }: { keyId: string; action: string; method?: string; body?: any }) => {
      if (action === "verify") setVerifyingId(keyId);
      const url = `/api/projects/${projectId}/widget/api-keys/${keyId}/${action}`;
      const res = await authFetch(apiUrl(url), {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) throw new Error(`Failed to ${action} key`);
      return res.json();
    },
    onSuccess: (_, variables) => {
      if (variables.action === "verify") {
        toast({ title: "Key Verified", description: "Connection is healthy." });
      } else {
        toast({ title: "Key updated" });
      }
      queryClient.invalidateQueries({ queryKey: ["project-api-keys", projectId] });
    },
    onError: (err: any) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      setVerifyingId(null);
    },
  });

  const handleAddKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    addKeyMutation.mutate({ apiKey: apiKey.trim(), name: name.trim() || undefined });
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
    switch (provider?.toLowerCase()) {
      case "gemini": return <Sparkles className="w-4 h-4 text-blue-400" />;
      case "openai": return <Cpu className="w-4 h-4 text-emerald-400" />;
      case "claude": return <Zap className="w-4 h-4 text-amber-400" />;
      case "groq": return <Zap className="w-4 h-4 text-orange-400" />;
      case "openrouter": return <Layers className="w-4 h-4 text-purple-400" />;
      default: return <Key className="w-4 h-4 text-primary" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="animate-spin w-6 h-6 text-primary" />
      </div>
    );
  }

  const keysList = apiKeys || [];

  return (
    <div className="space-y-8 mt-6">
      {/* Header with Guide Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" /> Project API Keys & Model Routing
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure dedicated provider credentials and AI models for this project's website widget.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowGuides(!showGuides)}
          className="text-xs shrink-0"
        >
          <BookOpen className="w-3.5 h-3.5 mr-1.5" />
          {showGuides ? "Hide Setup Guides" : "View Provider Setup Guides"}
        </Button>
      </div>

      {/* Optional Provider Guides Accordion */}
      {showGuides && (
        <div className="p-4 rounded-2xl bg-secondary/30 border border-border">
          <ProviderGuides />
        </div>
      )}

      {/* Add Project Key Card */}
      <Card className="bg-card border-border shadow-xs">
        <CardHeader className="pb-4 border-b border-border/50">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Add Project API Key
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Keys are tested live with the provider before saving and encrypted at rest with AES-256-GCM.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleAddKey} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-foreground">Key Label</label>
                <Input
                  type="text"
                  placeholder="e.g. Widget Gemini 2.5 Flash"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Secret API Key</label>
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

            <div className="flex items-center justify-end pt-2">
              <Button
                type="submit"
                size="sm"
                disabled={!apiKey.trim() || addKeyMutation.isPending}
                className="text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                {addKeyMutation.isPending ? "Verifying & Adding..." : "Verify & Add Project Key"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Active Keys List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" /> Configured Credentials ({keysList.length})
          </h3>
        </div>

        {keysList.length === 0 ? (
          <div className="p-8 rounded-2xl bg-card border border-border text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Key className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">No Dedicated Project Keys</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              This project will use your global user API keys or platform system credits by default. Add a project key above to isolate usage and assign specific widget models.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {keysList.map((k: any) => {
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
                      {/* Left info & Model selector */}
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

                        {/* Model selector */}
                        <div className="flex items-center gap-3 pt-1">
                          <span className="text-xs text-muted-foreground font-medium">Assigned Model:</span>
                          {k.availableModels && k.availableModels.length > 0 ? (
                            <select
                              value={k.model || k.availableModels[0]}
                              onChange={(e) => updateModelMutation.mutate({ keyId: k.id, model: e.target.value })}
                              className="bg-secondary/70 border border-border rounded-lg px-2.5 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
                            >
                              {k.availableModels.map((m: string) => (
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

                        {k.failureReason && (
                          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-500 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-lg">{k.failureReason}</span>
                          </div>
                        )}
                      </div>

                      {/* Right actions */}
                      <div className="flex flex-wrap items-center gap-2 border-t lg:border-t-0 pt-3 lg:pt-0 border-border/50">
                        {isFailing && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setKeyToFix({ ...k, type: "project", projectId })}
                            className="h-8 text-xs font-semibold"
                          >
                            <Wrench className="w-3.5 h-3.5 mr-1.5" /> Fix API
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={verifyingId === k.id}
                          onClick={() => actionMutation.mutate({ keyId: k.id, action: "verify", method: "POST" })}
                          className="h-8 text-xs"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${verifyingId === k.id ? "animate-spin" : ""}`} />
                          {verifyingId === k.id ? "Testing..." : "Verify"}
                        </Button>

                        {!k.isPrimary && k.isEnabled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => actionMutation.mutate({ keyId: k.id, action: "primary", method: "PATCH" })}
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Star className="w-3.5 h-3.5 mr-1" /> Set Primary
                          </Button>
                        )}

                        <div className="flex items-center gap-2 px-2">
                          <Switch
                            checked={k.isEnabled}
                            onCheckedChange={() => actionMutation.mutate({ 
                              keyId: k.id, 
                              action: k.isEnabled ? "disable" : "enable", 
                              method: "PATCH" 
                            })}
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
            <AlertDialogTitle className="text-base font-semibold">Delete Project API Key?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete <strong className="text-foreground">{keyToDelete?.name}</strong>? 
              This project will fall back to workspace keys or system defaults.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (keyToDelete) {
                  deleteKeyMutation.mutate(keyToDelete.id);
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
        onReverify={async () => {
          if (keyToFix) {
            actionMutation.mutate({ keyId: keyToFix.id, action: "verify", method: "POST" });
            setKeyToFix(null);
          }
        }}
        onClearCooldown={async () => {
          if (keyToFix) {
            actionMutation.mutate({ keyId: keyToFix.id, action: "reset-cooldown", method: "POST" });
            setKeyToFix(null);
          }
        }}
        onReplaceKey={async (_, newKey) => {
          if (keyToFix) {
            const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys/${keyToFix.id}`), {
              method: "PUT",
              body: JSON.stringify({ apiKey: newKey })
            });
            if (!res.ok) throw new Error("Failed to replace key");
            queryClient.invalidateQueries({ queryKey: ["project-api-keys", projectId] });
          }
        }}
      />
    </div>
  );
}
