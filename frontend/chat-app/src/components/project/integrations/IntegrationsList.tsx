import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, RefreshCw, ShieldCheck, Trash2, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ShopifyConnectDialog } from "./ShopifyConnectDialog";

interface IntegrationsListProps {
  projectId: string;
}

export function IntegrationsList({ projectId }: IntegrationsListProps) {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isConnectOpen, setIsConnectOpen] = useState(false);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = session?.access_token;
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  };

  const { data: integrations, isLoading } = useQuery({
    queryKey: ["project-integrations", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/integrations`));
      if (!res.ok) throw new Error("Failed to load integrations");
      const data = await res.json();
      return data.integrations as any[];
    }
  });

  const verifyMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/integrations/${integrationId}/verify`), {
        method: "POST"
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Verification failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Integration Verified", description: "The connection is valid." });
      queryClient.invalidateQueries({ queryKey: ["project-integrations", projectId] });
    },
    onError: (err: any) => {
      toast({ title: "Verification Failed", description: err.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["project-integrations", projectId] });
    }
  });

  const authorizeMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/integrations/${integrationId}/authorize`), {
        method: "POST"
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Authorization failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Integration Authorized", description: "Capabilities are now executable." });
      queryClient.invalidateQueries({ queryKey: ["project-integrations", projectId] });
    },
    onError: (err: any) => {
      toast({ title: "Authorization Failed", description: err.message, variant: "destructive" });
    }
  });

  const revokeMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/integrations/${integrationId}/revoke`), {
        method: "POST"
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Revocation failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Integration Revoked", description: "Credentials removed and tools disabled." });
      queryClient.invalidateQueries({ queryKey: ["project-integrations", projectId] });
    },
    onError: (err: any) => {
      toast({ title: "Revocation Failed", description: err.message, variant: "destructive" });
    }
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h4 className="text-lg font-semibold">Connected Systems</h4>
        <Button onClick={() => setIsConnectOpen(true)} className="gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 border-0">
          <Plus className="h-4 w-4" /> Connect Shopify
        </Button>
      </div>

      {(!integrations || integrations.length === 0) ? (
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Key className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground">No Integrations Connected</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-2">
              Connect your business systems to give your AI agent access to real-time data and actions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {integrations.map((integration) => (
            <Card key={integration.id} className="bg-card">
              <CardHeader className="pb-3 flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="capitalize flex items-center gap-2">
                    {integration.provider}
                    <Badge variant={
                      integration.status === "AUTHORIZED" ? "default" :
                      integration.status === "VERIFIED" ? "secondary" :
                      integration.status === "REVOKED" ? "destructive" : "outline"
                    }>
                      {integration.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-2">
                    <span>{integration.config?.shop || "Connected Account"}</span>
                    {integration.config?.environment === "test" ? (
                      <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10 text-xs">Sandbox / Test</Badge>
                    ) : (
                      <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-xs">Production</Badge>
                    )}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {integration.status === "CONNECTED" && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => verifyMutation.mutate(integration.id)}
                      disabled={verifyMutation.isPending}
                    >
                      {verifyMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                      Verify
                    </Button>
                  )}
                  {integration.status === "VERIFIED" && (
                    <Button 
                      size="sm" 
                      onClick={() => authorizeMutation.mutate(integration.id)}
                      disabled={authorizeMutation.isPending}
                      className="bg-green-600 hover:bg-green-500"
                    >
                      {authorizeMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                      Authorize
                    </Button>
                  )}
                  {integration.status !== "REVOKED" && (
                    <Button 
                      size="sm" 
                      variant="destructive" 
                      onClick={() => revokeMutation.mutate(integration.id)}
                      disabled={revokeMutation.isPending}
                    >
                      {revokeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </Button>
                  )}
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <ShopifyConnectDialog 
        projectId={projectId} 
        open={isConnectOpen} 
        onOpenChange={setIsConnectOpen} 
      />
    </div>
  );
}
