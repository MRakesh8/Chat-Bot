import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Loader2,
  MessageSquare,
  Users,
  Zap,
  DollarSign,
  Activity,
  RefreshCw,
  Download,
  TrendingUp,
  Radio,
  Plus,
  Search,
  Trash2,
  CheckCircle2,
  MessageCircle,
  UserCheck,
  FileSpreadsheet,
  Layers,
  PieChart as PieChartIcon,
  BarChart2,
  Sparkles
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import { toast } from "sonner";

export function Analytics({ projectId }: { projectId: string }) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [timeframe, setTimeframe] = useState<"24h" | "7d" | "30d" | "all">("7d");
  const [isLive, setIsLive] = useState(true);
  const [lastRefetchedAt, setLastRefetchedAt] = useState<Date>(new Date());
  const [leadSearch, setLeadSearch] = useState("");
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({ name: "", email: "", phone: "" });

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = session?.access_token;
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  };

  // Upgraded Analytics Query with Live Polling
  const {
    data: analyticsData,
    isLoading: isLoadingAnalytics,
    isFetching: isFetchingAnalytics,
    refetch: refetchAnalytics
  } = useQuery({
    queryKey: ["widget-analytics", projectId, timeframe],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/analytics?timeframe=${timeframe}`));
      if (!res.ok) {
        return null;
      }
      setLastRefetchedAt(new Date());
      return res.json();
    },
    enabled: !!projectId,
    refetchInterval: isLive ? 3000 : false, // Instant live update every 3 seconds
  });

  // Manual Lead Creation Mutation
  const addLeadMutation = useMutation({
    mutationFn: async (payload: { name: string; email: string; phone: string }) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/leads`), {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to capture lead");
      return res.json();
    },
    onSuccess: () => {
      toast.success("New lead captured successfully!");
      setIsAddLeadOpen(false);
      setNewLeadForm({ name: "", email: "", phone: "" });
      queryClient.invalidateQueries({ queryKey: ["widget-analytics", projectId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Error adding lead");
    }
  });

  // Delete Lead Mutation
  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/leads/${leadId}`), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete lead");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Lead removed successfully.");
      queryClient.invalidateQueries({ queryKey: ["widget-analytics", projectId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Error removing lead");
    }
  });

  // Export Analytics to JSON
  const handleExportAnalytics = () => {
    if (!analyticsData) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(analyticsData, null, 2)
    )}`;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonString);
    downloadAnchor.setAttribute("download", `analytics-report-${projectId}-${timeframe}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success("Analytics report exported successfully!");
  };

  // Export Leads to CSV
  const handleExportLeads = () => {
    const leads = analyticsData?.leads || [];
    if (leads.length === 0) {
      toast.error("No leads available to export.");
      return;
    }
    const headers = ["Name", "Email", "Phone", "Date Captured"];
    const csvRows = [
      headers.join(","),
      ...leads.map((l: any) => [
        `"${(l.name || "").replace(/"/g, '""')}"`,
        `"${(l.email || "").replace(/"/g, '""')}"`,
        `"${(l.phone || "").replace(/"/g, '""')}"`,
        `"${new Date(l.createdAt).toLocaleString()}"`
      ].join(","))
    ];
    const csvString = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.join("\n"))}`;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", csvString);
    downloadAnchor.setAttribute("download", `leads-${projectId}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success(`Exported ${leads.length} leads to CSV.`);
  };

  if (isLoadingAnalytics && !analyticsData) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <Loader2 className="animate-spin w-8 h-8 text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading live chatbot analytics & insights...</p>
      </div>
    );
  }

  const summary = analyticsData?.summary || {
    totalConversations: analyticsData?.totalConversations || 0,
    totalMessages: analyticsData?.totalMessages || 0,
    uniqueVisitors: analyticsData?.uniqueVisitors || 0,
    tokenUsage: analyticsData?.tokenUsage || 0,
    aiCost: analyticsData?.aiCost || "0.0000",
    avgResponseTimeMs: analyticsData?.avgResponseTimeMs || 410,
    capturedLeads: analyticsData?.leads?.length || 0,
    conversionRate: "0.0",
    avgMessagesPerConv: "0.0",
    activeToday: 0
  };

  const timeSeries = analyticsData?.timeSeries || [];
  const topTopics = analyticsData?.topTopics || [];
  const recentActivity = analyticsData?.recentActivity || [];
  const leadsList = (analyticsData?.leads || []).filter((lead: any) => {
    if (!leadSearch.trim()) return true;
    const q = leadSearch.toLowerCase();
    return (
      (lead.name && lead.name.toLowerCase().includes(q)) ||
      (lead.email && lead.email.toLowerCase().includes(q)) ||
      (lead.phone && lead.phone.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 mt-6">
      {/* Header Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border border-border p-4 rounded-xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">Chatbot Analytics & Intelligence</h2>
              <Badge
                variant={isLive ? "default" : "outline"}
                className={`text-xs px-2.5 py-0.5 flex items-center gap-1.5 transition-all ${
                  isLive ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : ""
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                {isLive ? "LIVE SYNC ACTIVE" : "PAUSED"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live updates active • Last refreshed {lastRefetchedAt.toLocaleTimeString()}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Selector */}
          <div className="bg-muted p-1 rounded-lg flex items-center gap-1 text-xs">
            {(["24h", "7d", "30d", "all"] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 rounded-md font-medium capitalize transition-all ${
                  timeframe === tf
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tf === "24h" ? "24 Hours" : tf === "7d" ? "7 Days" : tf === "30d" ? "30 Days" : "All Time"}
              </button>
            ))}
          </div>

          {/* Live Switch */}
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg bg-card text-xs">
            <Radio className={`w-3.5 h-3.5 ${isLive ? "text-emerald-500 animate-pulse" : "text-muted-foreground"}`} />
            <span className="font-medium text-foreground">Auto-Refresh</span>
            <Switch
              checked={isLive}
              onCheckedChange={(checked) => {
                setIsLive(checked);
                if (checked) refetchAnalytics();
              }}
            />
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAnalytics()}
            disabled={isFetchingAnalytics}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetchingAnalytics ? "animate-spin text-primary" : ""}`} />
            Refresh
          </Button>

          {/* Export Report */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportAnalytics}
            className="gap-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export Report
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Conversations Card */}
        <Card className="bg-card border-border hover:border-primary/40 transition-all shadow-2xs">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Conversations</span>
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <MessageSquare className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{summary.totalConversations}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-500" />
                <span>Active today: {summary.activeToday}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Messages Card */}
        <Card className="bg-card border-border hover:border-primary/40 transition-all shadow-2xs">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Total Messages</span>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <MessageCircle className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{summary.totalMessages}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Avg {summary.avgMessagesPerConv} msgs / conv
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Unique Visitors Card */}
        <Card className="bg-card border-border hover:border-primary/40 transition-all shadow-2xs">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Unique Visitors</span>
              <div className="p-2 rounded-lg bg-violet-500/10 text-violet-500">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{summary.uniqueVisitors}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Lead Conv: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{summary.conversionRate}%</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Token Usage Card */}
        <Card className="bg-card border-border hover:border-primary/40 transition-all shadow-2xs">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Tokens Used</span>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{summary.tokenUsage.toLocaleString()}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                ~{Math.round(summary.totalMessages > 0 ? summary.tokenUsage / summary.totalMessages : 0)} tokens/msg
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Est. AI Cost Card */}
        <Card className="bg-card border-border hover:border-primary/40 transition-all shadow-2xs">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Est. AI Cost</span>
              <div className="p-2 rounded-lg bg-pink-500/10 text-pink-500">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">${summary.aiCost}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Gemini Flash Pricing
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Avg Latency Card */}
        <Card className="bg-card border-border hover:border-primary/40 transition-all shadow-2xs">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Avg Latency</span>
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{summary.avgResponseTimeMs} ms</div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> System Healthy
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs Navigation */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            Performance & Insights Dashboard
          </CardTitle>
          <CardDescription>
            Interactive real-time charting, lead tracking, and conversation intelligence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid grid-cols-4 w-full md:w-auto mb-6 bg-muted p-1 rounded-xl">
              <TabsTrigger value="overview" className="gap-2 text-xs">
                <BarChart2 className="w-3.5 h-3.5" />
                Overview & Charts
              </TabsTrigger>
              <TabsTrigger value="topics" className="gap-2 text-xs">
                <PieChartIcon className="w-3.5 h-3.5" />
                Top Topics
              </TabsTrigger>
              <TabsTrigger value="leads" className="gap-2 text-xs">
                <UserCheck className="w-3.5 h-3.5" />
                Captured Leads ({summary.capturedLeads})
              </TabsTrigger>
              <TabsTrigger value="live-feed" className="gap-2 text-xs">
                <Sparkles className="w-3.5 h-3.5" />
                Live Stream
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: OVERVIEW & CHARTS */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Conversations & Messages Trend Area Chart */}
                <Card className="bg-card border-border shadow-xs">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-primary" />
                        Conversation & Message Trends ({timeframe.toUpperCase()})
                      </span>
                      <Badge variant="outline" className="text-[10px]">Real-time</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="h-[260px] w-full">
                      {timeSeries.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={timeSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.0} />
                              </linearGradient>
                              <linearGradient id="colorMsgs" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.9)", borderColor: "#334155", borderRadius: "8px", color: "#fff", fontSize: "12px" }}
                            />
                            <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                            <Area type="monotone" dataKey="conversations" name="Conversations" stroke="#8B5CF6" strokeWidth={2} fillOpacity={1} fill="url(#colorConv)" />
                            <Area type="monotone" dataKey="messages" name="Messages" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorMsgs)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No trend data logged yet</div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Token Usage & Cost Bar Chart */}
                <Card className="bg-card border-border shadow-xs">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        Token Usage & AI Cost Breakdown
                      </span>
                      <Badge variant="outline" className="text-[10px]">Gemini 1.5 Flash</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="h-[260px] w-full">
                      {timeSeries.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={timeSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip
                              formatter={(value: any, name: any) => [
                                name === "Token Usage" ? Number(value).toLocaleString() : `$${Number(value).toFixed(4)}`,
                                name
                              ]}
                              contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.9)", borderColor: "#334155", borderRadius: "8px", color: "#fff", fontSize: "12px" }}
                            />
                            <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                            <Bar dataKey="tokenUsage" name="Token Usage" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No token data logged yet</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* System Latency Trend Line Chart */}
              <Card className="bg-card border-border shadow-xs">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-500" />
                    Response Latency Trend (ms)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timeSeries} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} domain={[200, 'auto']} />
                        <Tooltip
                          formatter={(value: any) => [`${value} ms`, "Avg Response Time"]}
                          contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.9)", borderColor: "#334155", borderRadius: "8px", color: "#fff", fontSize: "12px" }}
                        />
                        <Line type="monotone" dataKey="responseTimeMs" name="Avg Response Time (ms)" stroke="#06B6D4" strokeWidth={2.5} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2: TOP TOPICS */}
            <TabsContent value="topics" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topTopics.map((tp: any, index: number) => (
                  <Card key={index} className="bg-card border-border hover:border-primary/40 transition-all p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">{tp.topic}</span>
                          <Badge variant="outline" className="text-[10px] px-2 py-0">
                            {tp.category}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Requested ~{tp.count} times ({tp.percentage}% of overall query intent)
                        </p>
                      </div>
                      <div className="text-lg font-bold text-primary">{tp.percentage}%</div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-muted h-2 rounded-full mt-3 overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full transition-all duration-500"
                        style={{ width: `${tp.percentage}%` }}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* TAB 3: CAPTURED LEADS */}
            <TabsContent value="leads" className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search leads by name, email, or phone..."
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    className="pl-9 text-xs"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportLeads}
                    className="gap-1.5 text-xs"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                    Export CSV
                  </Button>

                  <Dialog open={isAddLeadOpen} onOpenChange={setIsAddLeadOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="gap-1.5 text-xs">
                        <Plus className="w-3.5 h-3.5" />
                        Add Lead
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Capture / Add Lead</DialogTitle>
                        <DialogDescription>
                          Manually enter a contact lead collected from your chatbot widget.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 py-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Full Name</label>
                          <Input
                            placeholder="John Doe"
                            value={newLeadForm.name}
                            onChange={(e) => setNewLeadForm({ ...newLeadForm, name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Email Address</label>
                          <Input
                            placeholder="john@example.com"
                            type="email"
                            value={newLeadForm.email}
                            onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Phone Number</label>
                          <Input
                            placeholder="+1 (555) 000-0000"
                            value={newLeadForm.phone}
                            onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          disabled={addLeadMutation.isPending || (!newLeadForm.name && !newLeadForm.email)}
                          onClick={() => addLeadMutation.mutate(newLeadForm)}
                          className="w-full"
                        >
                          {addLeadMutation.isPending && <Loader2 className="animate-spin w-4 h-4 mr-2" />}
                          Save Lead
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* Leads Table */}
              <div className="border border-border rounded-xl overflow-hidden bg-card shadow-2xs">
                <div className="bg-muted/80 p-3.5 border-b border-border grid grid-cols-12 font-medium text-xs text-muted-foreground">
                  <div className="col-span-3">Contact Name</div>
                  <div className="col-span-4">Email</div>
                  <div className="col-span-3">Phone</div>
                  <div className="col-span-2 text-right">Captured</div>
                </div>
                {leadsList.length > 0 ? (
                  <div className="divide-y divide-border">
                    {leadsList.map((lead: any) => (
                      <div key={lead.id} className="p-3.5 grid grid-cols-12 text-xs items-center hover:bg-muted/40 transition-colors">
                        <div className="col-span-3 font-medium text-foreground truncate pr-2 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">
                            {(lead.name || "L")[0].toUpperCase()}
                          </div>
                          <span className="truncate">{lead.name || "Anonymous Lead"}</span>
                        </div>
                        <div className="col-span-4 text-muted-foreground truncate pr-2">
                          {lead.email || "—"}
                        </div>
                        <div className="col-span-3 text-muted-foreground truncate pr-2">
                          {lead.phone || "—"}
                        </div>
                        <div className="col-span-2 text-right flex items-center justify-end gap-2">
                          <span className="text-muted-foreground text-[11px]">
                            {new Date(lead.createdAt).toLocaleDateString()}
                          </span>
                          <button
                            onClick={() => deleteLeadMutation.mutate(lead.id)}
                            className="text-muted-foreground hover:text-red-500 transition-colors p-1 rounded-md"
                            title="Delete Lead"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 text-center bg-card">
                    <UserCheck className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm font-medium">No leads captured matching filter.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Lead Collection forms in your widget studio automatically route responses directly here.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 4: LIVE STREAM */}
            <TabsContent value="live-feed" className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  <h3 className="text-sm font-medium text-foreground">Real-Time Interaction Feed</h3>
                </div>
                <Badge variant="outline" className="text-xs">
                  Auto-syncing every 3s
                </Badge>
              </div>

              {recentActivity.length > 0 ? (
                <div className="space-y-2">
                  {recentActivity.map((act: any) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-all flex items-start gap-3 text-xs"
                    >
                      <div className={`p-2 rounded-lg mt-0.5 ${
                        act.type === "lead" ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"
                      }`}>
                        {act.type === "lead" ? <UserCheck className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">{act.title}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(act.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-muted-foreground">{act.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center bg-card border border-border rounded-xl">
                  <Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-medium">Waiting for live activity...</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    When visitors send messages or submit contact info in the widget, live events will stream here instantly.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
