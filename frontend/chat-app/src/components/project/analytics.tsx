import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MessageSquare, Users, Zap, DollarSign, Database, Table } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function Analytics({ projectId }: { projectId: string }) {
  const { session } = useAuth();

  const authFetch = async (url: string) => {
    const token = session?.access_token;
    return fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  const { data: analytics, isLoading: isLoadingAnalytics } = useQuery({
    queryKey: ["widget-analytics", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/analytics`));
      if (!res.ok) {
        // Fallback to empty if endpoint doesn't exist yet
        return {
          totalConversations: 0,
          totalMessages: 0,
          uniqueVisitors: 0,
          tokenUsage: 0,
          aiCost: 0,
        };
      }
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: leads, isLoading: isLoadingLeads } = useQuery({
    queryKey: ["widget-leads", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/leads`));
      if (!res.ok) {
        return [];
      }
      return res.json() as Promise<any[]>;
    },
    enabled: !!projectId,
  });

  if (isLoadingAnalytics || isLoadingLeads) return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-6 h-6" /></div>;

  return (
    <div className="space-y-8 mt-8">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Widget Analytics & Leads</CardTitle>
          <CardDescription>Track the performance of your embedded AI assistant.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="leads">Captured Leads</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-muted border-border">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-full bg-blue-500/10 text-blue-500">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Conversations</p>
                      <p className="text-2xl font-semibold">{analytics?.totalConversations || 0}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-muted border-border">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-full bg-green-500/10 text-green-500">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Unique Visitors</p>
                      <p className="text-2xl font-semibold">{analytics?.uniqueVisitors || 0}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-muted border-border">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-full bg-purple-500/10 text-purple-500">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Tokens Used</p>
                      <p className="text-2xl font-semibold">{analytics?.tokenUsage || 0}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-muted border-border">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-full bg-amber-500/10 text-amber-500">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Est. AI Cost</p>
                      <p className="text-2xl font-semibold">${Number(analytics?.aiCost || 0).toFixed(4)}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="p-8 border border-border rounded-xl bg-card text-center mt-8">
                 <Database className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                 <h3 className="text-lg font-medium">Detailed Analytics Coming Soon</h3>
                 <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-2">
                   We are collecting data, but charting is currently under development. Check back later for response times and popular questions.
                 </p>
              </div>
            </TabsContent>

            <TabsContent value="leads">
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="bg-muted p-4 border-b border-border grid grid-cols-4 font-medium text-sm">
                  <div>Name</div>
                  <div>Email</div>
                  <div>Phone</div>
                  <div>Date</div>
                </div>
                {leads && leads.length > 0 ? (
                  <div className="divide-y divide-border">
                    {leads.map((lead) => (
                      <div key={lead.id} className="p-4 grid grid-cols-4 text-sm bg-card hover:bg-muted/50 transition-colors">
                        <div className="truncate pr-4">{lead.name || "Unknown"}</div>
                        <div className="truncate pr-4">{lead.email || "N/A"}</div>
                        <div className="truncate pr-4">{lead.phone || "N/A"}</div>
                        <div className="text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString()}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 text-center bg-card">
                    <Table className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-sm font-medium">No leads captured yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">Make sure Lead Collection is enabled in the Widget Studio.</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
