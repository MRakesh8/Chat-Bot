import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Key, Plus, Trash2, ShieldCheck, Server, Star, PlayCircle, XCircle, CheckCircle } from "lucide-react";

export function ApiKeys({ projectId }: { projectId: string }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      console.debug("API key fetch started", { projectId });
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys`));
      if (!res.ok) throw new Error("Failed to load api keys");
      const data = await res.json() as any[];
      console.debug("API key fetch completed", { projectId });
      console.debug("API key count returned", { count: data?.length || 0 });
      return data;
    },
    enabled: !!projectId,
  });

  const [apiKey, setApiKey] = useState("");
  const [name, setName] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

  const addKeyMutation = useMutation({
    mutationFn: async (data: { apiKey: string; name?: string }) => {
      console.debug("API key save started");
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys`), {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add key");
      return res.json();
    },
    onMutate: async (newKey) => {
      // Cancel any outgoing refetches to prevent optimistic update overwrite
      await queryClient.cancelQueries({ queryKey: ["project-api-keys", projectId] });
      const previousKeys = queryClient.getQueryData<any[]>(["project-api-keys", projectId]);

      // Update local state immediately (Optimistic UI update)
      queryClient.setQueryData(["project-api-keys", projectId], (old: any[] | undefined) => {
        const optimisticKey = {
          id: `temp-${Date.now()}`,
          name: newKey.name || `API Key`,
          provider: "detecting...",
          maskedKey: newKey.apiKey.substring(0, 5) + "..." + newKey.apiKey.substring(newKey.apiKey.length - 4),
          model: "detecting...",
          createdAt: new Date().toISOString()
        };
        return old ? [...old, optimisticKey] : [optimisticKey];
      });

      return { previousKeys };
    },
    onError: (err, newKey, context) => {
      if (context?.previousKeys) {
        queryClient.setQueryData(["project-api-keys", projectId], context.previousKeys);
      }
      toast({ title: "Failed to add API key", variant: "destructive" });
    },
    onSuccess: (data) => {
      console.debug("API key save completed");
      toast({ title: `Successfully added ${data.provider} key`, description: `Default model: ${data.model}` });
      setApiKey("");
      setName("");
    },
    onSettled: () => {
      // Invalidate cache and refetch API keys
      queryClient.invalidateQueries({ queryKey: ["project-api-keys", projectId] });
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
    onMutate: async (keyId) => {
      await queryClient.cancelQueries({ queryKey: ["project-api-keys", projectId] });
      const previousKeys = queryClient.getQueryData<any[]>(["project-api-keys", projectId]);
      queryClient.setQueryData(["project-api-keys", projectId], (old: any[] | undefined) => 
        old?.filter(key => key.id !== keyId) || []
      );
      return { previousKeys };
    },
    onError: (err, keyId, context) => {
      if (context?.previousKeys) {
        queryClient.setQueryData(["project-api-keys", projectId], context.previousKeys);
      }
      toast({ title: "Failed to delete API key", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "API Key deleted!" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["project-api-keys", projectId] });
    }
  });

  const actionMutation = useMutation({
    mutationFn: async ({ keyId, action, method = "PATCH" }: { keyId: string; action: string; method?: string }) => {
      if (action === "test") setTestingId(keyId);
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys/${keyId}/${action}`), {
        method,
      });
      if (!res.ok) throw new Error(`Failed to ${action} key`);
      return res.json();
    },
    onSuccess: (data, variables) => {
      if (variables.action === "test") {
        toast({ title: `Test result: ${data.status}` });
      } else {
        toast({ title: `Successfully executed ${variables.action} on key` });
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

  const changeModelMutation = useMutation({
    mutationFn: async ({ keyId, model }: { keyId: string; model: string }) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys/${keyId}`), {
        method: "PUT",
        body: JSON.stringify({ model })
      });
      if (!res.ok) throw new Error(`Failed to change model`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: `Successfully updated model` });
      queryClient.invalidateQueries({ queryKey: ["project-api-keys", projectId] });
    },
    onError: () => {
      toast({ title: `Failed to update model`, variant: "destructive" });
    }
  });

  const refreshModelsMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys/${keyId}/refresh-models`), {
        method: "POST"
      });
      if (!res.ok) {
        const errorData = await res.json().catch(()=>({}));
        throw new Error(errorData.error || `Failed to refresh models`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Successfully refreshed models`, description: `Found ${data.models?.length || 0} models.` });
      queryClient.invalidateQueries({ queryKey: ["project-api-keys", projectId] });
    },
    onError: (err: any) => {
      toast({ title: `Failed to refresh models`, description: err.message, variant: "destructive" });
    }
  });

  const handleAddKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;
    addKeyMutation.mutate({ apiKey, name });
  };

  const getStatusIcon = (status: string, isEnabled: boolean) => {
    if (!isEnabled) return <div className="w-2 h-2 rounded-full bg-gray-500" title="Disabled" />;
    if (status === "HEALTHY") return <div className="w-2 h-2 rounded-full bg-green-500" title="Healthy" />;
    if (status === "COOLDOWN" || status === "QUOTA_EXCEEDED") return <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" title="Cooldown / Quota" />;
    return <div className="w-2 h-2 rounded-full bg-red-500" title="Invalid" />;
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-6 h-6" /></div>;

  return (
    <div className="space-y-8 mt-8">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Project API Keys</CardTitle>
          <CardDescription>
            Dedicated AI provider keys for this project's widget.
            If not provided, the widget will fall back to your User Keys or System Keys.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddKey} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mb-8 p-4 bg-muted border border-border rounded-lg">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name (Optional)</label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="e.g. Prod Key" 
                className="bg-card"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">API Key</label>
              <Input 
                type="password"
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)} 
                placeholder="Paste API Key here (Gemini, Groq, OpenAI, Anthropic, OpenRouter)..." 
                className="bg-card"
              />
            </div>

            <Button type="submit" disabled={!apiKey || addKeyMutation.isPending} className="w-full gap-2">
              {addKeyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Verify & Add
            </Button>
          </form>

          <div className="space-y-4">
            <h3 className="text-sm font-medium border-b border-border pb-2">Active Keys</h3>
            {apiKeys && apiKeys.length > 0 ? (
              <div className="space-y-2">
                {apiKeys.map((key) => (
                  <div key={key.id} className="flex flex-col gap-2 p-3 border border-foreground/5 rounded-lg bg-background/50 backdrop-blur-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-muted rounded-md"><Key size={16} /></div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{key.name || `${key.provider} Key`}</p>
                            {key.isPrimary && <span title="Primary Key"><Star size={14} className="text-yellow-500 fill-yellow-500 shrink-0" /></span>}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono truncate">{key.maskedKey}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded-full text-xs font-medium whitespace-nowrap">
                          {getStatusIcon(key.status || 'HEALTHY', key.isEnabled)}
                          {key.isEnabled ? (key.status || 'HEALTHY') : "DISABLED"}
                        </div>
                        {key.cooldownRemaining > 0 && (
                          <span className="text-xs text-yellow-600 bg-yellow-500/10 px-2 py-1 rounded-full whitespace-nowrap">
                            {key.cooldownRemaining}m cooldown
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Actions row */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-2 pt-2 border-t border-border/50 gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground w-full sm:w-auto">
                        <span>Provider: <span className="uppercase font-medium text-foreground">{key.provider}</span></span>
                        
                        {key.availableModels && Array.isArray(key.availableModels) && key.availableModels.length > 0 ? (
                          <div className="flex items-center gap-2 ml-2">
                            <span>Model:</span>
                            <Select 
                              value={key.model || ""} 
                              onValueChange={(val) => changeModelMutation.mutate({ keyId: key.id, model: val })}
                            >
                              <SelectTrigger className="h-7 text-xs bg-background">
                                <SelectValue placeholder="Select model" />
                              </SelectTrigger>
                              <SelectContent>
                                {key.availableModels.map((m: string) => (
                                  <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 w-7 p-0" 
                              onClick={() => refreshModelsMutation.mutate(key.id)}
                              title="Refresh available models"
                              disabled={refreshModelsMutation.isPending}
                            >
                              <Loader2 className={`w-3 h-3 ${refreshModelsMutation.isPending ? 'animate-spin' : 'hidden'}`} />
                              <Server className={`w-3 h-3 ${refreshModelsMutation.isPending ? 'hidden' : ''}`} />
                            </Button>
                          </div>
                        ) : (
                          key.model && <span className="ml-2">| Model: {key.model}</span>
                        )}

                        {key.status !== "HEALTHY" && key.failureReason && <span className="text-red-500 ml-2" title={key.failureReason}>| Error: {key.failureReason.substring(0, 30)}...</span>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => actionMutation.mutate({ keyId: key.id, action: "primary" })} className="p-1.5 text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10 rounded-md transition-colors" title="Set as Primary">
                          <Star size={14} />
                        </button>
                        <button type="button" onClick={() => actionMutation.mutate({ keyId: key.id, action: "test", method: "POST" })} disabled={testingId === key.id} className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded-md transition-colors" title="Test Key">
                          <PlayCircle size={14} className={testingId === key.id ? "animate-spin" : ""} />
                        </button>
                        <button type="button" onClick={() => actionMutation.mutate({ keyId: key.id, action: key.isEnabled ? "disable" : "enable" })} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title={key.isEnabled ? "Disable Key" : "Enable Key"}>
                          {key.isEnabled ? <XCircle size={14} /> : <CheckCircle size={14} />}
                        </button>
                        <button type="button" onClick={() => deleteKeyMutation.mutate(key.id)} disabled={deleteKeyMutation.isPending} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors" title="Delete Key">
                          {deleteKeyMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-muted border border-border rounded-lg">
                <Server className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
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
