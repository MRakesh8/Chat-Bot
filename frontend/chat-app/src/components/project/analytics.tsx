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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  HelpCircle,
  AlertTriangle,
  BarChart2,
  Sparkles,
  Edit3,
  Check,
  ArrowLeft
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

export function Analytics({ 
  projectId,
  onSelectTab
}: { 
  projectId: string;
  onSelectTab?: (tab: string, subtab?: string, options?: { pushHistory?: boolean }) => void;
}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [timeframe, setTimeframe] = useState<"24h" | "7d" | "30d" | "all">("7d");
  const [isLive, setIsLive] = useState(true);
  const [lastRefetchedAt, setLastRefetchedAt] = useState<Date>(new Date());
  const [leadSearch, setLeadSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  
  const [newLeadForm, setNewLeadForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    notes: "",
    status: "NEW",
    score: "MEDIUM"
  });

  const [editingLead, setEditingLead] = useState<any | null>(null);

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

  // Upgraded Analytics Query
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
    refetchInterval: isLive ? 3000 : false,
  });

  // Add Lead Mutation
  const addLeadMutation = useMutation({
    mutationFn: async (payload: typeof newLeadForm) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/leads`), {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to capture lead");
      return res.json();
    },
    onSuccess: () => {
      toast.success("New lead added successfully!");
      setIsAddLeadOpen(false);
      setNewLeadForm({ name: "", email: "", phone: "", company: "", notes: "", status: "NEW", score: "MEDIUM" });
      queryClient.invalidateQueries({ queryKey: ["widget-analytics", projectId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Error adding lead");
    }
  });

  // Update Lead Status / Details Mutation
  const updateLeadMutation = useMutation({
    mutationFn: async ({ leadId, updates }: { leadId: string; updates: any }) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/leads/${leadId}`), {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update lead");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Lead updated successfully.");
      setEditingLead(null);
      queryClient.invalidateQueries({ queryKey: ["widget-analytics", projectId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Error updating lead");
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

  // Resolve Knowledge Gap Mutation
  const resolveGapMutation = useMutation({
    mutationFn: async (gapId: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/unanswered-questions/${gapId}/resolve`), {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Failed to resolve knowledge gap");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Knowledge gap marked as resolved!");
      queryClient.invalidateQueries({ queryKey: ["widget-analytics", projectId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Error resolving question");
    }
  });

  // Export Analytics JSON
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

  // Rule 10: Formula Sanitization for CSV Export
  const sanitizeCsvCell = (val: any): string => {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }
    return `"${str.replace(/"/g, '""')}"`;
  };

  // Export Leads CSV
  const handleExportLeads = () => {
    const leads = analyticsData?.leads || [];
    if (leads.length === 0) {
      toast.error("No leads available to export.");
      return;
    }
    const headers = ["Name", "Email", "Phone", "Company", "Intent", "Status", "Score", "Score Value", "Captured Date"];
    const csvRows = [
      headers.join(","),
      ...leads.map((l: any) => [
        sanitizeCsvCell(l.name || "Anonymous Lead"),
        sanitizeCsvCell(l.email || ""),
        sanitizeCsvCell(l.phone || ""),
        sanitizeCsvCell(l.company || ""),
        sanitizeCsvCell(l.userIntent || "general"),
        sanitizeCsvCell(l.status || "NEW"),
        sanitizeCsvCell(l.score || "MEDIUM"),
        sanitizeCsvCell(l.scoreValue || 50),
        sanitizeCsvCell(new Date(l.createdAt).toLocaleString())
      ].join(","))
    ];
    const csvString = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.join("\n"))}`;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", csvString);
    downloadAnchor.setAttribute("download", `leads-${projectId}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success(`Exported ${leads.length} leads safely to CSV.`);
  };

  if (isLoadingAnalytics && !analyticsData) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <Loader2 className="animate-spin w-8 h-8 text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading live chatbot business intelligence...</p>
      </div>
    );
  }

  const summary = analyticsData?.summary || {
    totalConversations: analyticsData?.totalConversations || 0,
    totalMessages: analyticsData?.totalMessages || 0,
    uniqueVisitors: analyticsData?.uniqueVisitors || 0,
    tokenUsage: analyticsData?.tokenUsage || 0,
    aiCost: analyticsData?.aiCost || "0.0000",
    avgResponseTimeMs: analyticsData?.avgResponseTimeMs || 350,
    capturedLeads: analyticsData?.leads?.length || 0,
    highIntentLeads: 0,
    conversionRate: "0.0",
    avgMessagesPerConv: "0.0",
    activeToday: 0
  };

  const timeSeries = analyticsData?.timeSeries || [];
  const topQuestions = analyticsData?.topQuestions || [];
  const unansweredQuestions = analyticsData?.unansweredQuestions || [];
  const recentActivity = analyticsData?.recentActivity || [];

  const leadsList = (analyticsData?.leads || []).filter((lead: any) => {
    if (statusFilter !== "ALL" && (lead.status || "NEW") !== statusFilter) return false;
    if (!leadSearch.trim()) return true;
    const q = leadSearch.toLowerCase();
    return (
      (lead.name && lead.name.toLowerCase().includes(q)) ||
      (lead.email && lead.email.toLowerCase().includes(q)) ||
      (lead.phone && lead.phone.toLowerCase().includes(q)) ||
      (lead.company && lead.company.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 mt-6">
      {/* Top Navigation Bar: Back to Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (onSelectTab) {
                onSelectTab("overview", undefined, { pushHistory: true });
              } else {
                const overviewTab = document.querySelector('[data-value="overview"]') as HTMLElement || document.querySelector('[value="overview"]') as HTMLElement;
                if (overviewTab) overviewTab.click();
              }
            }}
            data-testid="analytics-back-to-overview-btn"
            aria-label="Back to Overview Dashboard"
            className="text-xs font-semibold gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Overview
          </Button>
          <span className="text-muted-foreground text-xs">/</span>
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5 text-primary" />
            Detailed Analytics & Intelligence
          </span>
        </div>
        <Badge variant="outline" className="text-[10px] w-fit text-muted-foreground font-mono">
          Project: {projectId}
        </Badge>
      </div>

      {/* Header Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border border-border p-4 rounded-xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">Chatbot Business Intelligence</h2>
              <Badge
                variant={isLive ? "default" : "outline"}
                className={`text-xs px-2.5 py-0.5 flex items-center gap-1.5 transition-all ${
                  isLive ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : ""
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                {isLive ? ((summary.activeNow || 0) > 0 ? `${summary.activeNow} ACTIVE NOW` : "LIVE SYNC ACTIVE") : "PAUSED"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Isolated project analytics • Refreshed {lastRefetchedAt.toLocaleTimeString()}
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
            Export JSON
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
                Lead Conv Rate: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{summary.conversionRate}%</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Captured Leads Card */}
        <Card className="bg-card border-border hover:border-primary/40 transition-all shadow-2xs">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Captured Leads</span>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <UserCheck className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{summary.capturedLeads}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                High-Intent: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{summary.highIntentLeads}</span>
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
                {summary.tokenUsage.toLocaleString()} tokens
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Avg Latency Card */}
        <Card className="bg-card border-border hover:border-primary/40 transition-all shadow-2xs">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Avg Response Latency</span>
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

      {/* Main Dashboard Tabs */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            Chatbot Intelligence & Lead Dashboard
          </CardTitle>
          <CardDescription>
            Manage project leads, analyze frequent user questions, track knowledge gaps, and monitor engagement trends.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid grid-cols-2 md:grid-cols-6 w-full bg-muted p-1 rounded-xl mb-6">
              <TabsTrigger value="overview" className="gap-2 text-xs">
                <BarChart2 className="w-3.5 h-3.5" />
                Overview & Charts
              </TabsTrigger>
              <TabsTrigger value="faq" className="gap-2 text-xs">
                <HelpCircle className="w-3.5 h-3.5" />
                Top Questions ({topQuestions.length})
              </TabsTrigger>
              <TabsTrigger value="gaps" className="gap-2 text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                Unanswered ({unansweredQuestions.length})
              </TabsTrigger>
              <TabsTrigger value="leads" className="gap-2 text-xs">
                <UserCheck className="w-3.5 h-3.5" />
                Leads ({summary.capturedLeads})
              </TabsTrigger>
              <TabsTrigger value="feedback" className="gap-2 text-xs">
                <MessageSquare className="w-3.5 h-3.5" />
                Feedback
              </TabsTrigger>
              <TabsTrigger value="live-feed" className="gap-2 text-xs">
                <Sparkles className="w-3.5 h-3.5" />
                Live Stream
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: OVERVIEW */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Conversations Trend Chart */}
                <Card className="bg-card border-border shadow-xs">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-primary" />
                        Conversation & Message Trends
                      </span>
                      <Badge variant="outline" className="text-[10px]">{timeframe.toUpperCase()}</Badge>
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
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No conversation data recorded yet</div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Token Usage Chart */}
                <Card className="bg-card border-border shadow-xs">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        Token Usage & AI Cost Breakdown
                      </span>
                      <Badge variant="outline" className="text-[10px]">Gemini Models</Badge>
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
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No token usage logged yet</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Latency Trend */}
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

            {/* TAB 2: TOP QUESTIONS (FAQs) */}
            <TabsContent value="faq" className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Frequently Asked Questions</h3>
                  <p className="text-xs text-muted-foreground">User queries normalized and grouped by frequency.</p>
                </div>
                <Badge variant="outline" className="text-xs">{topQuestions.length} Unique FAQs</Badge>
              </div>

              {topQuestions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {topQuestions.map((fq: any) => (
                    <Card key={fq.id} className="bg-card border-border hover:border-primary/40 transition-all p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-foreground">{fq.questionText}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary" className="text-[10px] px-2 py-0">
                              {fq.category || "General"}
                            </Badge>
                            <span>Asked {fq.count} time{fq.count === 1 ? "" : "s"}</span>
                          </div>
                        </div>
                        <div className="text-sm font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg">
                          #{fq.count}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center bg-card border border-border rounded-xl">
                  <HelpCircle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-medium">No frequent questions recorded yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    When visitors ask questions in your widget, normalized FAQs will be aggregated here automatically.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* TAB 3: UNANSWERED QUESTIONS (KNOWLEDGE GAPS) */}
            <TabsContent value="gaps" className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Unanswered Questions & Knowledge Gaps</h3>
                  <p className="text-xs text-muted-foreground">Queries where chatbot confidence was low or context was missing.</p>
                </div>
                <Badge variant="outline" className="text-xs">{unansweredQuestions.length} Gaps Recorded</Badge>
              </div>

              {unansweredQuestions.length > 0 ? (
                <div className="space-y-3">
                  {unansweredQuestions.map((gap: any) => (
                    <Card key={gap.id} className={`bg-card border p-4 transition-all ${
                      gap.isResolved ? "border-emerald-500/30 bg-emerald-500/5" : "border-border hover:border-amber-500/40"
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-foreground">{gap.questionText}</span>
                            <Badge variant={gap.isResolved ? "default" : "destructive"} className="text-[10px]">
                              {gap.isResolved ? "RESOLVED" : "UNRESOLVED"}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                            <span>Asked {gap.askedCount} time{gap.askedCount === 1 ? "" : "s"}</span>
                            <span>•</span>
                            <span>Reason: {gap.reason || "Low Retrieval Confidence"}</span>
                            {gap.sourceUrl && (
                              <>
                                <span>•</span>
                                <span className="truncate max-w-[200px]">Source: {gap.sourceUrl}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {!gap.isResolved && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resolveGapMutation.mutate(gap.id)}
                            disabled={resolveGapMutation.isPending}
                            className="gap-1.5 text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Mark Resolved
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center bg-card border border-border rounded-xl">
                  <AlertTriangle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-medium">No knowledge gaps detected!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Questions that your AI assistant cannot confidently answer will be surfaced here for easy review.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* TAB 4: CAPTURED LEADS */}
            <TabsContent value="leads" className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search name, email, phone..."
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      className="pl-9 text-xs"
                    />
                  </div>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[130px] text-xs">
                      <SelectValue placeholder="Filter Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Statuses</SelectItem>
                      <SelectItem value="NEW">New</SelectItem>
                      <SelectItem value="CONTACTED">Contacted</SelectItem>
                      <SelectItem value="QUALIFIED">Qualified</SelectItem>
                      <SelectItem value="CONVERTED">Converted</SelectItem>
                      <SelectItem value="LOST">Lost</SelectItem>
                    </SelectContent>
                  </Select>
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
                        <DialogTitle>Manual Lead Entry</DialogTitle>
                        <DialogDescription>
                          Add a new contact lead for your project.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 py-2 text-xs">
                        <div className="space-y-1">
                          <label className="font-medium">Full Name</label>
                          <Input
                            placeholder="Jane Smith"
                            value={newLeadForm.name}
                            onChange={(e) => setNewLeadForm({ ...newLeadForm, name: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="font-medium">Email Address</label>
                            <Input
                              placeholder="jane@company.com"
                              type="email"
                              value={newLeadForm.email}
                              onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="font-medium">Phone Number</label>
                            <Input
                              placeholder="+1 (555) 000-0000"
                              value={newLeadForm.phone}
                              onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="font-medium">Company Name</label>
                          <Input
                            placeholder="Acme Corp"
                            value={newLeadForm.company}
                            onChange={(e) => setNewLeadForm({ ...newLeadForm, company: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="font-medium">Status</label>
                            <Select
                              value={newLeadForm.status}
                              onValueChange={(val) => setNewLeadForm({ ...newLeadForm, status: val })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="NEW">NEW</SelectItem>
                                <SelectItem value="CONTACTED">CONTACTED</SelectItem>
                                <SelectItem value="QUALIFIED">QUALIFIED</SelectItem>
                                <SelectItem value="CONVERTED">CONVERTED</SelectItem>
                                <SelectItem value="LOST">LOST</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <label className="font-medium">Score</label>
                            <Select
                              value={newLeadForm.score}
                              onValueChange={(val) => setNewLeadForm({ ...newLeadForm, score: val })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="LOW">LOW</SelectItem>
                                <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                                <SelectItem value="HIGH">HIGH</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="font-medium">Notes</label>
                          <Input
                            placeholder="Interested in enterprise custom setup"
                            value={newLeadForm.notes}
                            onChange={(e) => setNewLeadForm({ ...newLeadForm, notes: e.target.value })}
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
                  <div className="col-span-3">Contact / Company</div>
                  <div className="col-span-3">Email & Phone</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Intent & Score</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                {leadsList.length > 0 ? (
                  <div className="divide-y divide-border">
                    {leadsList.map((lead: any) => (
                      <div key={lead.id} className="p-3.5 grid grid-cols-12 text-xs items-center hover:bg-muted/40 transition-colors">
                        <div className="col-span-3 font-medium text-foreground truncate pr-2 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                            {(lead.name || "L")[0].toUpperCase()}
                          </div>
                          <div className="truncate">
                            <p className="font-semibold truncate text-foreground">{lead.name || "Anonymous Lead"}</p>
                            {lead.company && <p className="text-[10px] text-muted-foreground truncate">{lead.company}</p>}
                          </div>
                        </div>

                        <div className="col-span-3 text-muted-foreground truncate pr-2">
                          <p className="truncate text-foreground font-medium">{lead.email || "—"}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{lead.phone || "—"}</p>
                        </div>

                        <div className="col-span-2 pr-2">
                          <Select
                            value={lead.status || "NEW"}
                            onValueChange={(newStatus) => updateLeadMutation.mutate({ leadId: lead.id, updates: { status: newStatus } })}
                          >
                            <SelectTrigger className="h-7 text-[11px] px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NEW">NEW</SelectItem>
                              <SelectItem value="CONTACTED">CONTACTED</SelectItem>
                              <SelectItem value="QUALIFIED">QUALIFIED</SelectItem>
                              <SelectItem value="CONVERTED">CONVERTED</SelectItem>
                              <SelectItem value="LOST">LOST</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="col-span-2 pr-2">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-2 py-0 font-semibold ${
                                lead.score === "HIGH"
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  : lead.score === "MEDIUM"
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {lead.score || "MEDIUM"}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground capitalize truncate">
                              {lead.userIntent || "general"}
                            </span>
                          </div>
                        </div>

                        <div className="col-span-2 text-right flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditingLead(lead)}
                            title="Edit Lead Notes"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-red-500"
                            onClick={() => deleteLeadMutation.mutate(lead.id)}
                            title="Delete Lead"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 text-center bg-card">
                    <UserCheck className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm font-medium">No leads captured matching filter.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Leads captured during chatbot interactions will automatically populate here.
                    </p>
                  </div>
                )}
              </div>

              {/* Rich Lead Qualification & Follow-up Modal */}
              {editingLead && (
                <Dialog open={!!editingLead} onOpenChange={() => setEditingLead(null)}>
                  <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                      <div className="flex items-center justify-between gap-3 pr-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base shrink-0">
                            {(editingLead.name || "L")[0].toUpperCase()}
                          </div>
                          <div>
                            <DialogTitle className="text-base font-bold flex items-center gap-2">
                              {editingLead.name || "Anonymous Lead"}
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-2 py-0.5 font-semibold ${
                                  editingLead.score === "HIGH"
                                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                    : editingLead.score === "MEDIUM"
                                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {editingLead.score || "MEDIUM"} INTENT
                              </Badge>
                            </DialogTitle>
                            <DialogDescription className="text-xs mt-0.5">
                              Captured via AI Chatbot • {new Date(editingLead.createdAt || Date.now()).toLocaleString()}
                            </DialogDescription>
                          </div>
                        </div>
                      </div>
                    </DialogHeader>

                    <div className="space-y-4 py-3 text-xs">
                      {/* Contact Info Card */}
                      <div className="grid grid-cols-2 gap-3 bg-muted/40 p-3.5 rounded-xl border border-border">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Email</p>
                          {editingLead.email ? (
                            <a href={`mailto:${editingLead.email}`} className="font-medium text-primary hover:underline truncate block">
                              {editingLead.email}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">Not provided</span>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Phone</p>
                          {editingLead.phone ? (
                            <a href={`tel:${editingLead.phone}`} className="font-medium text-primary hover:underline truncate block">
                              {editingLead.phone}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">Not provided</span>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Company</p>
                          <Input
                            className="h-7 text-xs bg-background"
                            placeholder="Add company..."
                            value={editingLead.company || ""}
                            onChange={(e) => setEditingLead({ ...editingLead, company: e.target.value })}
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Intent Category</p>
                          <span className="font-semibold text-foreground capitalize bg-background px-2 py-1 rounded border border-border inline-block">
                            {editingLead.userIntent || "General Inquiry"}
                          </span>
                        </div>
                      </div>

                      {/* Recommended Follow-up Action */}
                      <div className="bg-primary/5 border border-primary/20 p-3 rounded-xl flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-primary uppercase font-bold tracking-wider">Recommended Next Action</p>
                          <p className="font-semibold text-foreground mt-0.5">
                            {editingLead.score === "HIGH" && (editingLead.userIntent === "pricing" || editingLead.userIntent === "purchase")
                              ? "Send Pricing Quote & Call Immediately"
                              : editingLead.score === "HIGH" && editingLead.userIntent === "demo"
                              ? "Schedule Product Demo Walkthrough"
                              : editingLead.email || editingLead.phone
                              ? "Follow up via Email / Phone"
                              : "Nurture lead via chatbot updates"}
                          </p>
                        </div>
                        <Badge className="bg-primary text-primary-foreground font-semibold">Priority</Badge>
                      </div>

                      {/* Status Selector */}
                      <div className="space-y-1.5">
                        <label className="font-semibold text-foreground">Lead Lifecycle Status</label>
                        <Select
                          value={editingLead.status || "NEW"}
                          onValueChange={(val) => setEditingLead({ ...editingLead, status: val })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NEW">NEW — Uncontacted Lead</SelectItem>
                            <SelectItem value="CONTACTED">CONTACTED — Reached out via phone/email</SelectItem>
                            <SelectItem value="QUALIFIED">QUALIFIED — Needs identified, high-fit</SelectItem>
                            <SelectItem value="CONVERTED">CONVERTED — Deal closed / customer onboarded</SelectItem>
                            <SelectItem value="LOST">LOST — Unresponsive / not a fit</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Owner Notes */}
                      <div className="space-y-1.5">
                        <label className="font-semibold text-foreground">Follow-up Notes & Conversation Summary</label>
                        <Textarea
                          rows={3}
                          placeholder="Record details of your follow-up calls, customer requirements, or next step commitments..."
                          value={editingLead.notes || ""}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditingLead({ ...editingLead, notes: e.target.value })}
                          className="bg-background text-xs font-sans"
                        />
                      </div>
                    </div>

                    <DialogFooter className="flex gap-2 sm:justify-between">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this lead?")) {
                            deleteLeadMutation.mutate(editingLead.id);
                            setEditingLead(null);
                          }
                        }}
                        className="border-red-500/30 text-red-500 hover:bg-red-500/10 text-xs"
                      >
                        Delete Lead
                      </Button>
                      <div className="flex gap-2">
                        <Button type="button" variant="ghost" onClick={() => setEditingLead(null)} className="text-xs">
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={() => updateLeadMutation.mutate({ leadId: editingLead.id, updates: editingLead })}
                          disabled={updateLeadMutation.isPending}
                          className="text-xs gap-1.5"
                        >
                          {updateLeadMutation.isPending && <Loader2 className="animate-spin w-3.5 h-3.5" />}
                          Save Lead Details
                        </Button>
                      </div>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </TabsContent>

            {/* TAB 5: FEEDBACK */}
            <TabsContent value="feedback" className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">AI Response Feedback</h3>
                  <p className="text-xs text-muted-foreground">Monitor visitor satisfaction (likes and dislikes) regarding AI answers.</p>
                </div>
                <Badge variant="outline" className="text-xs">{(analyticsData?.feedback || []).length} Recorded</Badge>
              </div>

              {(analyticsData?.feedback || []).length > 0 ? (
                <div className="space-y-3">
                  {analyticsData.feedback.map((fb: any) => (
                    <Card key={fb.id} className="bg-card border-border p-4 hover:border-primary/40 transition-all">
                      <div className="flex items-start justify-between gap-3 text-xs">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2">
                            {fb.category === "SUGGESTION" ? (
                              <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1">💡 Suggestion</Badge>
                            ) : fb.category === "AI_RESPONSE_LIKE" ? (
                              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1">👍 Helpful</Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1 bg-red-500/10 text-red-500 border-red-500/20">👎 Not Helpful</Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground">{new Date(fb.createdAt).toLocaleString()}</span>
                          </div>
                          <div className="p-3 bg-muted/40 rounded-md border border-border text-foreground font-medium">
                            <span className="text-muted-foreground text-[10px] uppercase block mb-1">
                              {fb.category === "SUGGESTION" ? "Visitor Suggestion Note" : "AI Response Context"}
                            </span>
                            {fb.comment}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center bg-card border border-border rounded-xl">
                  <MessageSquare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-medium">No feedback recorded yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    When visitors click 👍 or 👎 on AI responses in your widget, their feedback will appear here.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* TAB 6: LIVE STREAM */}
            <TabsContent value="live-feed" className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  <h3 className="text-sm font-semibold text-foreground">Real-Time Interaction Feed</h3>
                </div>
                <Badge variant="outline" className="text-xs">Project Isolated</Badge>
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
                    When visitors send messages or submit contact info in the widget, live events will stream here.
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
