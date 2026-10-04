import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  Users, 
  MessageSquare, 
  Zap, 
  Activity, 
  Plug, 
  Globe, 
  Smartphone, 
  AlertTriangle,
  CreditCard,
  RefreshCw,
  UserCheck,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  Rocket,
  Mail,
  Phone,
  Clock,
  ExternalLink,
  Layers,
  Building2
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import { useAuthFetch } from "@/hooks/use-auth-fetch";

export function DashboardOverview({ projectId }: { projectId: string }) {
  const { session } = useAuth();
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [isReAnalyzing, setIsReAnalyzing] = React.useState(false);

  const { data: dashboardData, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-dashboard", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/dashboard`));
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with status ${res.status}`);
      }
      return res.json();
    },
    enabled: !!projectId,
    refetchInterval: 15000, // Refresh every 15s
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <Loader2 className="animate-spin w-8 h-8 text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading dashboard intelligence...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center border border-dashed border-red-500/20 rounded-xl bg-red-500/5 mt-6">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <div>
          <p className="text-foreground font-medium mb-1">Failed to load dashboard</p>
          <p className="text-muted-foreground text-sm max-w-sm">
            {(error as Error)?.message || "Could not connect to the server."}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Retrying..." : "Retry"}
        </Button>
      </div>
    );
  }

  if (!dashboardData) return null;

  const { overview, integrations, website, whatsapp, usage, errors } = dashboardData;

  // Truthful activity summary (no random data generation)
  const activityData = [
    { date: "Current Period", conversations: overview.totalConversations || 0, aiResponses: overview.aiResponses || 0 }
  ];

  return (
    <div className="space-y-6 mt-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Captured Leads</span>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <UserCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-bold text-foreground">{overview.capturedLeads || 0}</div>
              {overview.highIntentLeads > 0 && (
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  {overview.highIntentLeads} High Intent
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Conversations</span>
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <MessageSquare className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-foreground">{overview.totalConversations}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">AI Responses</span>
              <div className="p-2 rounded-lg bg-violet-500/10 text-violet-500">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-foreground">{overview.aiResponses}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Total Customers</span>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-foreground">{overview.totalCustomers}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Charts & Activity */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-card border-border shadow-xs overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  AI Engagement Overview
                </span>
                <Badge variant="outline" className="text-[10px]">LIVE METRICS</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {overview.totalConversations > 0 ? (
                <div className="h-[220px] w-full max-w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorAi" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.9)", borderColor: "#334155", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
                      <Area type="monotone" dataKey="aiResponses" name="AI Responses" stroke="#8B5CF6" strokeWidth={2} fillOpacity={1} fill="url(#colorAi)" />
                      <Area type="monotone" dataKey="conversations" name="Conversations" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorConv)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-10 text-center border border-dashed border-border rounded-xl bg-muted/20">
                  <MessageSquare className="w-8 h-8 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-foreground">No Chat Activity Recorded Yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Deploy your chatbot widget on your website to start interacting with visitors and tracking live engagement.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => {
                      const deployTab = document.querySelector('[data-value="deployment"]') as HTMLElement || document.querySelector('[value="deployment"]') as HTMLElement;
                      if (deployTab) deployTab.click();
                    }}
                  >
                    <Rocket className="w-3.5 h-3.5" /> Deploy Widget
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border shadow-xs overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Plug className="w-4 h-4 text-pink-500" />
                  Connected Integrations
                </span>
                <Badge variant="outline" className="text-[10px]">{integrations.length} CONNECTED</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 overflow-x-auto">
              {integrations.length > 0 ? (
                <div className="space-y-3 min-w-[300px]">
                  {integrations.map((integration: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-background flex items-center justify-center border border-border font-bold text-xs uppercase text-primary">
                          {integration.provider?.[0] || 'I'}
                        </div>
                        <div>
                          <p className="text-sm font-medium capitalize">{integration.provider}</p>
                        </div>
                      </div>
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">{integration.status || 'CONNECTED'}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <p className="text-sm text-muted-foreground mb-3">No business systems connected yet.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5 border-border"
                    onClick={() => {
                      const intTab = document.querySelector('[data-value="integrations"]') as HTMLElement || document.querySelector('[value="integrations"]') as HTMLElement;
                      if (intTab) intTab.click();
                    }}
                  >
                    <Plug className="w-3.5 h-3.5" /> Connect Systems
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Status & System Health */}
        <div className="space-y-6">
          {/* Website Intelligence Profile Card */}
          <Card className="bg-card border-border shadow-xs overflow-hidden">
            <CardHeader className="pb-3 border-b border-border bg-muted/30">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-500" />
                  Website Intelligence Profile
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={website.status === 'READY' || website.status === 'COMPLETED' ? 'default' : 'outline'} className={website.status === 'READY' || website.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' : ''}>
                    {website.status || 'READY'}
                  </Badge>
                  {website.url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      disabled={isReAnalyzing}
                      onClick={async () => {
                        if (!website?.url) return;
                        setIsReAnalyzing(true);
                        try {
                          const res = await authFetch(apiUrl(`/api/projects/${projectId}/discovery/start`), {
                            method: "POST",
                            body: JSON.stringify({ url: website.url }),
                          });
                          if (!res.ok) {
                            const errJson = await res.json().catch(() => ({}));
                            throw new Error(errJson.error || "Failed to start website re-analysis");
                          }
                          toast({ title: "Analysis Started", description: "Website Intelligence 2.0 is updating your Business Profile." });
                          refetch();
                        } catch (e: any) {
                          toast({ title: "Error", description: e.message || "Failed to restart analysis", variant: "destructive" });
                        } finally {
                          setIsReAnalyzing(false);
                        }
                      }}
                      title="Re-analyze Website"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isReAnalyzing ? 'animate-spin' : ''}`} />
                    </Button>
                  )}
                </div>
              </CardTitle>
              {website.url && (
                <CardDescription className="text-xs truncate flex items-center gap-1 mt-1">
                  <span className="text-foreground font-medium truncate">{website.intelligence?.identity?.name || website.intelligence?.title || (website.url ? new URL(website.url).hostname : '')}</span>
                  <a href={website.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5 ml-1 shrink-0">
                    {website.url ? new URL(website.url).hostname : ''} <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* Identity & Badges */}
              <div className="flex flex-wrap gap-1.5">
                {website.businessType && (
                  <Badge variant="outline" className="text-[10px] capitalize bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                    <Building2 className="w-3 h-3 mr-1" /> {website.businessType.replace('_', ' ')}
                  </Badge>
                )}
                {website.platform && (
                  <Badge variant="outline" className="text-[10px] capitalize bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                    {website.platform}
                  </Badge>
                )}
                {website.intelligence?.pages?.length > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    <Layers className="w-3 h-3 mr-1" /> {website.intelligence.pages.length} Pages Indexed
                  </Badge>
                )}
              </div>

              {/* Contact & Hours */}
              {(website.intelligence?.contact?.emails?.length > 0 || website.intelligence?.contact?.phones?.length > 0 || website.intelligence?.contact?.hours?.length > 0) && (
                <div className="space-y-1.5 text-xs text-muted-foreground border-t border-border pt-3">
                  {website.intelligence?.contact?.emails?.[0] && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate">{website.intelligence.contact.emails[0]}</span>
                    </div>
                  )}
                  {website.intelligence?.contact?.phones?.[0] && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">{website.intelligence.contact.phones[0]}</span>
                    </div>
                  )}
                  {website.intelligence?.contact?.hours?.[0] && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="truncate">{website.intelligence.contact.hours[0]}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Discovered Offerings & FAQs Summary */}
              {((website.intelligence?.offerings?.length || 0) > 0 || (website.intelligence?.faqs?.length || 0) > 0) && (
                <div className="grid grid-cols-2 gap-2 text-xs border-t border-border pt-3">
                  <div className="p-2 rounded bg-muted/50 border border-border">
                    <span className="text-[10px] uppercase text-muted-foreground block font-medium">Offerings</span>
                    <span className="text-sm font-semibold text-foreground">{website.intelligence?.offerings?.length || 0} extracted</span>
                  </div>
                  <div className="p-2 rounded bg-muted/50 border border-border">
                    <span className="text-[10px] uppercase text-muted-foreground block font-medium">FAQs</span>
                    <span className="text-sm font-semibold text-foreground">{website.intelligence?.faqs?.length || 0} extracted</span>
                  </div>
                </div>
              )}

              {/* Page Index Breakdown */}
              {website.intelligence?.pages?.length > 0 && (
                <div className="border-t border-border pt-3 space-y-1.5">
                  <span className="text-[10px] uppercase text-muted-foreground font-medium block">Crawled Page Map</span>
                  <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
                    {website.intelligence.pages.map((p: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/40 border border-border">
                        <span className="truncate max-w-[160px] text-foreground">{p.title || p.url}</span>
                        <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4">
                          {p.category}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* WhatsApp Status */}
          <Card className="bg-card border-border shadow-xs">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10 text-green-500 shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">WhatsApp</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[150px]">Business API</p>
                </div>
              </div>
              <Badge variant="outline" className={whatsapp.status === 'CONNECTED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shrink-0' : 'text-muted-foreground shrink-0'}>
                {(whatsapp.status || 'NOT_CONFIGURED').toUpperCase()}
              </Badge>
            </CardContent>
          </Card>

          {/* Usage & Quota */}
          <Card className="bg-card border-border shadow-xs">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CreditCard className="w-4 h-4 text-primary" /> Usage / Quota
                </div>
                <Badge variant="outline" className="text-[10px] uppercase">{usage.plan || 'PRO'} PLAN</Badge>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Current Usage</span>
                  <span className="font-medium">{usage.currentUsage || 0} / {usage.quota > 0 ? usage.quota : '∞'}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-primary h-2 transition-all duration-300" 
                    style={{ width: `${usage.quota > 0 ? Math.min(100, (usage.currentUsage / usage.quota) * 100) : 0}%` }}
                  />
                </div>
                {usage.resetAt && (
                  <p className="text-[10px] text-muted-foreground text-right mt-1">
                    Resets {new Date(usage.resetAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Errors */}
          <Card className="bg-card border-border shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Recent System Errors
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {errors && errors.length > 0 ? (
                <div className="space-y-3">
                  {errors.map((error: any, i: number) => (
                    <div key={i} className="text-xs p-2.5 rounded-lg border border-red-500/20 bg-red-500/5 break-words">
                      <p className="font-medium text-red-400 mb-1">{error.message}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(error.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-emerald-500">
                  <p className="text-sm font-medium flex items-center justify-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" /> System Healthy
                  </p>
                  <p className="text-xs opacity-80 mt-1">No recent errors logged.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
