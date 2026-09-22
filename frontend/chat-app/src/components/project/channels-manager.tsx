import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MessageSquare, Smartphone, Trash2, Plus, Copy } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

import { useAuthFetch } from "@/hooks/use-auth-fetch";


export function ChannelsManager({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authFetch = useAuthFetch();

  const { data: connections = [], isLoading: loadingConnections } = useQuery({
    queryKey: ["whatsapp-connections", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/whatsapp/connections`));
      if (!res.ok) throw new Error("Failed to load connections");
      return res.json() as Promise<any[]>;
    }
  });

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ["whatsapp-settings", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/whatsapp/settings`));
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json() as Promise<any>;
    }
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: any) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/whatsapp/settings`), {
        method: "PUT",
        body: JSON.stringify(newSettings)
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-settings", projectId] });
      toast({ title: "Settings saved successfully." });
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" })
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/whatsapp/connections/${id}`), {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to delete connection");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-connections", projectId] });
      toast({ title: "Connection deleted." });
    }
  });

  const [isAdding, setIsAdding] = useState(false);
  const [newConn, setNewConn] = useState({ provider: "timelinesai", accountId: "", token: "", displayName: "" });

  const addConnectionMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/whatsapp/connections`), {
        method: "POST",
        body: JSON.stringify({
          provider: newConn.provider,
          providerAccountId: newConn.accountId,
          displayName: newConn.displayName,
          credentials: { apiToken: newConn.token, accessToken: newConn.token, phoneNumberId: newConn.accountId }
        })
      });
      if (!res.ok) throw new Error("Failed to add connection");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-connections", projectId] });
      toast({ title: "Connection added." });
      setIsAdding(false);
      setNewConn({ provider: "timelinesai", accountId: "", token: "", displayName: "" });
    }
  });

  if (loadingConnections || loadingSettings) return <div className="text-muted-foreground p-4">Loading channels...</div>;

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>WhatsApp AI Settings</CardTitle>
          <CardDescription>Configure how AI responds to WhatsApp messages.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-foreground">Auto-Reply Enabled</h3>
              <p className="text-sm text-muted-foreground">Allow AI to automatically answer questions</p>
            </div>
            <Switch 
              checked={settings?.autoReplyEnabled || false} 
              onCheckedChange={(c) => updateSettingsMutation.mutate({ autoReplyEnabled: c })} 
            />
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-foreground">Reply Mode</h3>
            <Select 
              value={settings?.replyMode || "all_business_questions"} 
              onValueChange={(v) => updateSettingsMutation.mutate({ replyMode: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_business_questions">All Business Questions</SelectItem>
                <SelectItem value="selected_topics">Selected Topics Only</SelectItem>
                <SelectItem value="human_only">Human Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>WhatsApp Connections</CardTitle>
            <CardDescription>Connect Meta or TimelinesAI workspaces</CardDescription>
          </div>
          {!isAdding && <Button onClick={() => setIsAdding(true)} size="sm"><Plus className="w-4 h-4 mr-2"/> Add Connection</Button>}
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdding && (
            <div className="bg-muted p-4 rounded-lg space-y-4 border border-border">
              <h3 className="font-medium">New Connection</h3>
              <div className="grid gap-4">
                <Select value={newConn.provider} onValueChange={v => setNewConn({...newConn, provider: v})}>
                  <SelectTrigger><SelectValue placeholder="Select Provider" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="timelinesai">TimelinesAI (Personal/Normal WA)</SelectItem>
                    <SelectItem value="meta">Meta Official Business API</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Display Name (e.g. Sales Line)" value={newConn.displayName} onChange={e => setNewConn({...newConn, displayName: e.target.value})} />
                <Input placeholder={newConn.provider === "meta" ? "Phone Number ID" : "Workspace ID"} value={newConn.accountId} onChange={e => setNewConn({...newConn, accountId: e.target.value})} />
                <Input type="password" placeholder="API Token / Access Token" value={newConn.token} onChange={e => setNewConn({...newConn, token: e.target.value})} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
                  <Button onClick={() => addConnectionMutation.mutate()} disabled={addConnectionMutation.isPending}>Save</Button>
                </div>
              </div>
            </div>
          )}

          {connections.length === 0 && !isAdding ? (
            <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
              No WhatsApp connections configured yet.
            </div>
          ) : (
            connections.map((c) => (
              <div key={c.id} className="flex flex-col gap-2 p-4 bg-muted border border-border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-foreground flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-green-500" />
                      {c.displayName || c.providerAccountId}
                    </h3>
                    <p className="text-xs text-muted-foreground uppercase">{c.provider} • Status: {c.status === "connected" ? <span className="text-green-500">Connected</span> : <span className="text-yellow-500">{c.status}</span>}</p>
                    {c.lastError && <p className="text-xs text-red-400 mt-1">Error: {c.lastError}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={async () => {
                      toast({ title: "Testing connection..." });
                      const res = await authFetch(apiUrl(`/api/projects/${projectId}/whatsapp/connections/${c.id}/test`), { method: "POST" });
                      if (res.ok) {
                        toast({ title: "Success", description: "Connection verified." });
                        queryClient.invalidateQueries({ queryKey: ["whatsapp-connections", projectId] });
                      } else {
                        const err = await res.json();
                        toast({ title: "Verification Failed", description: err.error, variant: "destructive" });
                        queryClient.invalidateQueries({ queryKey: ["whatsapp-connections", projectId] });
                      }
                    }}>Test</Button>
                    <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-400/10" onClick={() => deleteConnectionMutation.mutate(c.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="mt-2 text-sm bg-background p-2 rounded flex flex-col gap-1 border border-border">
                  <span className="text-muted-foreground text-xs font-semibold">Webhook URL (Copy this to Provider Dashboard)</span>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs truncate select-all">{c.webhookUrl}</code>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(c.webhookUrl); toast({title: "Copied!"})}}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
