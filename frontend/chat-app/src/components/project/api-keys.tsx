import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Key, Plus, Trash2, Server, Star, PlayCircle, XCircle, CheckCircle, Activity, Clock, RefreshCw, BarChart3, Zap, AlertCircle } from "lucide-react";

export function ApiKeys({ projectId }: { projectId: string }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedKeyId, setExpandedKeyId] = useState<string | null>(null);

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
      return await res.json() as any[];
    },
    enabled: !!projectId,
    refetchInterval: 30000, // Live updates every 30s
  });

  const [apiKey, setApiKey] = useState("");
  const [name, setName] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

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
      toast({ title: `Successfully added ${data.provider} key`, description: `Default model: ${data.model}` });
      setApiKey("");
      setName("");
      queryClient.invalidateQueries({ queryKey: ["project-api-keys", projectId] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to add API key", description: err.message, variant: "destructive" });
    }
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
      toast({ title: "API Key deleted!" });
      queryClient.invalidateQueries({ queryKey: ["project-api-keys", projectId] });
    },
    onError: () => {
      toast({ title: "Failed to delete API key", variant: "destructive" });
    }
  });

  const actionMutation = useMutation({
    mutationFn: async ({ keyId, action, method = "PATCH", body }: { keyId: string; action: string; method?: string; body?: any }) => {
      if (action === "test" || action === "verify") setTestingId(keyId);
      
      let url = `/api/projects/${projectId}/widget/api-keys/${keyId}/${action}`;
      if (action === "update") {
        url = `/api/projects/${projectId}/widget/api-keys/${keyId}`;
      }

      const res = await authFetch(apiUrl(url), {
        method,
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      if (!res.ok) throw new Error(`Failed to ${action} key`);
      return res.json();
    },
    onSuccess: (data, variables) => {
      if (variables.action === "test") {
        toast({ title: `Test result: ${data.status}` });
      } else if (variables.action === "verify") {
        toast({ title: `Active Check Complete`, description: data.success ? "Healthy" : "Failed" });
      } else {
        toast({ title: `Successfully updated key` });
      }
      queryClient.invalidateQueries({ queryKey: ["project-api-keys", projectId] });
    },
    onError: (err, variables) => {
      toast({ title: `Failed to ${variables.action} API key`, variant: "destructive" });
    },
    onSettled: () => {
      setTestingId(null);
    }
  });

  const handleAddKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;
    addKeyMutation.mutate({ apiKey, name });
  };

  const getStatusBadge = (status: string, isEnabled: boolean) => {
    if (!isEnabled) return <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-500/10 text-gray-500 rounded-full text-xs font-medium"><div className="w-2 h-2 rounded-full bg-gray-500" /> DISABLED</div>;
    if (status === "HEALTHY") return <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-green-600 rounded-full text-xs font-medium"><div className="w-2 h-2 rounded-full bg-green-500" /> HEALTHY</div>;
    if (["RATE_LIMIT", "TOKEN_LIMIT", "COOLDOWN"].includes(status)) return <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 text-yellow-600 rounded-full text-xs font-medium"><div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" /> {status.replace("_", " ")}</div>;
    if (status === "DAILY_QUOTA" || status === "MONTHLY_CREDIT") return <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-500/10 text-orange-600 rounded-full text-xs font-medium"><div className="w-2 h-2 rounded-full bg-orange-500" /> QUOTA EXHAUSTED</div>;
    if (status === "INVALID_MODEL") return <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 text-blue-600 rounded-full text-xs font-medium"><div className="w-2 h-2 rounded-full bg-blue-500" /> INVALID MODEL</div>;
    return <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 text-red-600 rounded-full text-xs font-medium"><div className="w-2 h-2 rounded-full bg-red-500" /> {status.replace("_", " ")}</div>;
  };

  const formatCooldown = (cooldownUntil: string | null) => {
    if (!cooldownUntil) return null;
    const diff = new Date(cooldownUntil).getTime() - Date.now();
    if (diff <= 0) return null;
    const mins = Math.ceil(diff / 60000);
    return `${mins}m cooldown`;
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-6 h-6" /></div>;

  return (
    <div className="space-y-8 mt-8">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Enterprise API Health (Project specific)
          </CardTitle>
          <CardDescription>
            Dedicated AI provider keys for this project's widget.
            If not provided, the widget will fall back to your User Keys or System Keys.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Add Key Form */}
          <form onSubmit={handleAddKey} className="flex flex-col md:flex-row gap-3 items-end mb-8 p-4 bg-muted border border-border rounded-lg">
            <div className="w-full md:w-1/3 space-y-2">
              <label className="text-sm font-medium">Name (Optional)</label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="e.g. Prod Key" 
                className="bg-card"
              />
            </div>
            <div className="w-full md:flex-1 space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <Input 
                type="password"
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)} 
                placeholder="Paste API Key here..." 
                className="bg-card font-mono"
              />
            </div>
            <Button type="submit" disabled={!apiKey || addKeyMutation.isPending} className="w-full md:w-auto gap-2 min-w-[120px]">
              {addKeyMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {addKeyMutation.isPending ? "Verifying..." : "Add Key"}
            </Button>
          </form>

          <div className="space-y-4">
            <h3 className="text-sm font-medium border-b border-border pb-2">Active Keys</h3>
            {apiKeys && apiKeys.length > 0 ? (
              <div className="grid gap-4">
                {apiKeys.map((key) => {
                  const cooldown = formatCooldown(key.cooldownUntil);
                  const isExpanded = expandedKeyId === key.id;
                  
                  return (
                    <div key={key.id} className="flex flex-col border border-foreground/10 rounded-xl bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      {/* Top Bar: Name, Status, Primary */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 bg-muted/20">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-background border border-foreground/5 rounded-lg shadow-sm">
                            <Key className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-foreground">{key.name || "Unnamed Key"}</h3>
                              {key.isPrimary && <Star size={14} className="text-yellow-500 fill-yellow-500" />}
                              <span className="text-xs uppercase px-2 py-0.5 bg-foreground/5 text-foreground/70 rounded font-medium tracking-wide">
                                {key.provider}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">{key.maskedKey}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {getStatusBadge(key.status, key.isEnabled)}
                          {cooldown && (
                            <span className="text-xs font-medium text-yellow-600 bg-yellow-500/10 px-2 py-1 rounded-full flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {cooldown}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Metrics Row */}
                      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-foreground/5 border-t border-foreground/5 bg-background/50">
                        <div className="p-3 flex flex-col gap-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Health Score</span>
                          <div className="flex items-end gap-2">
                            <span className={`text-xl font-light ${key.healthScore >= 95 ? 'text-green-500' : key.healthScore >= 80 ? 'text-yellow-500' : 'text-red-500'}`}>
                              {key.healthScore ?? 100}
                            </span>
                            <span className="text-xs text-muted-foreground mb-1">/ 100</span>
                          </div>
                        </div>
                        <div className="p-3 flex flex-col gap-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Avg Latency</span>
                          <div className="flex items-end gap-2">
                            <span className="text-xl font-light text-foreground">{key.latencyMs ?? 0}</span>
                            <span className="text-xs text-muted-foreground mb-1">ms</span>
                          </div>
                        </div>
                        <div className="p-3 flex flex-col gap-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Success Rate</span>
                          <div className="flex items-end gap-2">
                            <span className="text-xl font-light text-foreground">
                              {key.totalRequests > 0 ? Math.round(((key.totalRequests - key.totalFailures) / key.totalRequests) * 100) : 100}%
                            </span>
                            <span className="text-xs text-muted-foreground mb-1">({key.totalRequests} reqs)</span>
                          </div>
                        </div>
                        <div className="p-3 flex flex-col gap-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Tokens Today</span>
                          <div className="flex items-end gap-2">
                            <span className="text-xl font-light text-foreground">{(key.tokensToday || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions & Diagnostics Toggle */}
                      <div className="p-3 border-t border-foreground/5 flex items-center justify-between bg-muted/10">
                        <div className="flex items-center gap-2">
                          <button 
                            type="button"
                            onClick={() => setExpandedKeyId(isExpanded ? null : key.id)}
                            className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 px-2 py-1 rounded hover:bg-primary/5 transition-colors"
                          >
                            <BarChart3 className="w-3 h-3" /> 
                            {isExpanded ? "Hide Diagnostics" : "View Diagnostics"}
                          </button>
                          
                          {key.status !== "HEALTHY" && key.failureReason && !isExpanded && (
                            <span className="text-xs text-red-500 ml-2 max-w-[200px] truncate" title={key.failureReason}>
                              Error: {key.failureReason}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button type="button" onClick={() => actionMutation.mutate({ keyId: key.id, action: "primary" })} className="p-1.5 text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10 rounded-md transition-colors" title="Set as Primary">
                            <Star size={16} />
                          </button>
                          <button type="button" onClick={() => actionMutation.mutate({ keyId: key.id, action: "verify", method: "POST" })} disabled={testingId === key.id} className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded-md transition-colors flex items-center gap-1" title="Active Health Check">
                            <RefreshCw size={14} className={testingId === key.id ? "animate-spin text-blue-500" : ""} />
                            <span className="text-xs hidden sm:inline-block">Check Health</span>
                          </button>
                          <button type="button" onClick={() => actionMutation.mutate({ keyId: key.id, action: key.isEnabled ? "disable" : "enable" })} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title={key.isEnabled ? "Disable Key" : "Enable Key"}>
                            {key.isEnabled ? <XCircle size={16} /> : <CheckCircle size={16} />}
                          </button>
                          <button type="button" onClick={() => deleteKeyMutation.mutate(key.id)} disabled={deleteKeyMutation.isPending} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors" title="Delete Key">
                            {deleteKeyMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Diagnostics Panel */}
                      {isExpanded && (
                        <div className="p-4 bg-foreground/[0.02] border-t border-foreground/5 grid gap-4 md:grid-cols-2 text-sm">
                          <div className="space-y-3">
                            <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Configuration</h4>
                            <div className="grid grid-cols-3 gap-2 items-center">
                              <span className="text-muted-foreground">Default Model</span>
                              <div className="col-span-2 flex items-center gap-2">
                                <select 
                                  value={key.model || ""} 
                                  onChange={(e) => actionMutation.mutate({ keyId: key.id, action: "update", method: "PUT", body: { model: e.target.value } })}
                                  className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 outline-none focus:border-primary"
                                >
                                  <option value="" disabled>Select model</option>
                                  {key.availableModels?.map((m: string) => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-muted-foreground">Created</span>
                              <span className="col-span-2 font-mono text-xs">{new Date(key.createdAt).toLocaleString()}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-muted-foreground">Total Usage</span>
                              <span className="col-span-2 font-mono text-xs">{key.totalRequests} reqs / {key.totalFailures} fails</span>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Health Status</h4>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-muted-foreground">Last Success</span>
                              <span className="col-span-2 font-mono text-xs text-green-500">{key.lastSuccess ? new Date(key.lastSuccess).toLocaleString() : "Never"}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <span className="text-muted-foreground">Last Failure</span>
                              <span className="col-span-2 font-mono text-xs text-red-500">{key.lastFailure ? new Date(key.lastFailure).toLocaleString() : "Never"}</span>
                            </div>
                            {key.failureReason && (
                              <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-red-600 text-xs font-mono break-all">
                                {key.failureReason}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 bg-muted border border-border rounded-lg">
                <Server className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-20" />
                <p className="text-sm text-muted-foreground">No project keys added.</p>
                <p className="text-xs text-muted-foreground mt-1">Widget will use User/System keys.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
