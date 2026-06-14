import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Key, Plus, Trash2, ShieldCheck, Server } from "lucide-react";

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
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys`));
      if (!res.ok) throw new Error("Failed to load api keys");
      return res.json() as Promise<any[]>;
    },
    enabled: !!projectId,
  });

  const [provider, setProvider] = useState("gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");

  const addKeyMutation = useMutation({
    mutationFn: async (data: { provider: string; apiKey: string; model?: string }) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys`), {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add key");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-api-keys", projectId] });
      toast({ title: "API Key added successfully!" });
      setApiKey("");
      setModel("");
    },
    onError: () => toast({ title: "Failed to add API key", variant: "destructive" }),
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
      queryClient.invalidateQueries({ queryKey: ["project-api-keys", projectId] });
      toast({ title: "API Key deleted!" });
    },
    onError: () => toast({ title: "Failed to delete API key", variant: "destructive" }),
  });

  const handleAddKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;
    addKeyMutation.mutate({ provider, apiKey, model });
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
              <label className="text-sm font-medium">Provider</label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="bg-card">
                  <SelectValue placeholder="Select Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Google Gemini</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="claude">Anthropic Claude</SelectItem>
                  <SelectItem value="groq">Groq</SelectItem>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Model (Optional)</label>
              <Input 
                value={model} 
                onChange={(e) => setModel(e.target.value)} 
                placeholder="e.g. gpt-4o" 
                className="bg-card"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <Input 
                type="password"
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)} 
                placeholder="sk-..." 
                className="bg-card"
              />
            </div>

            <Button type="submit" disabled={!apiKey || addKeyMutation.isPending} className="w-full gap-2">
              {addKeyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Key
            </Button>
          </form>

          <div className="space-y-4">
            <h3 className="text-sm font-medium border-b border-border pb-2">Active Keys</h3>
            {apiKeys && apiKeys.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {apiKeys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between p-4 border border-border rounded-lg bg-card">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-primary/10 rounded-full text-primary">
                        <Key className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm capitalize">{key.provider}</p>
                          {key.isEnabled && <span className="text-[10px] bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Active</span>}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-1">{key.maskedKey}</p>
                        {key.model && <p className="text-[10px] text-muted-foreground mt-0.5">Model: {key.model}</p>}
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => deleteKeyMutation.mutate(key.id)}
                      disabled={deleteKeyMutation.isPending}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
