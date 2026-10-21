import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, Globe, MessageSquare, Database, LayoutDashboard, Settings, FileText, Paintbrush, Rocket, Key, Pencil, Brain, CreditCard, Sparkles, Share2, Check, Smartphone, ShieldCheck, ShieldAlert, AlertTriangle, AlertCircle, RefreshCw, ArrowLeft, Compass, ExternalLink, Laptop, CheckCircle2, ArrowRight, Cpu, ChevronDown, SlidersHorizontal, Wrench, Inbox, Bell } from "lucide-react";
import { DashboardOverview } from "../components/project/dashboard-overview";
import { KnowledgeBase } from "../components/project/knowledge-base";
import { WidgetStudio } from "../components/project/widget-studio";
import { VisitorInboxTab } from "../components/project/visitor-inbox-tab";
import { ChannelsManager } from "../components/project/channels-manager";
import { Deployment } from "../components/project/deployment";
import { ApiKeys } from "../components/project/api-keys";
import { Analytics } from "../components/project/analytics";
import { ContextSettings } from "../components/project/context-settings";
import { OnboardingWizard } from "../components/project/onboarding-wizard";
import { IntegrationsList } from "../components/project/integrations/IntegrationsList";
import { BillingSection } from "../components/project/billing-section";
import { Notifications } from "../components/project/notifications";
import { ProjectGuide } from "../components/project/project-guide";
import { AgentControlCenter } from "../components/agent-control/AgentControlCenter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSavedProjectTab, saveProjectTab } from "@/lib/workspace-continuity";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiUrl } from "@/lib/api-url";
import { useProjectTabPrefetch } from "@/hooks/use-tab-prefetch";

type NavGroup = {
  id: string;
  title: string;
  description: string;
  icon: any;
  items: {
    id: string;
    label: string;
    icon: any;
  }[];
};

const PROJECT_NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    title: "Overview",
    description: "Overview & Dashboard",
    icon: LayoutDashboard,
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
    ],
  },
  {
    id: "ai-context",
    title: "AI & Context",
    description: "Bot Testing & Context Engine",
    icon: Brain,
    items: [
      { id: "chat", label: "Test Chat", icon: MessageSquare },
      { id: "context-engine", label: "Context Engine", icon: Brain },
    ],
  },
  {
    id: "website-experience",
    title: "Website Experience",
    description: "Visitor Inbox & Channels",
    icon: Inbox,
    items: [
      { id: "conversations", label: "Visitor Inbox", icon: Inbox },
      { id: "channels", label: "Channels", icon: Smartphone },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    description: "Reports, Analytics, Integrations, Control & Settings",
    icon: Wrench,
    items: [
      { id: "reports", label: "Reports", icon: FileText },
      { id: "analytics", label: "Analytics", icon: LayoutDashboard },
      { id: "integrations", label: "Integrations", icon: Sparkles },
      { id: "agent-control", label: "Agent Control", icon: Cpu },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type Project = {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  userId: string;
  shareToken: string;
  isActive: boolean;
  websiteUrl?: string | null;
  status?: string;
  createdAt: string;
  updatedAt: string;
  entitlement?: {
    allowed: boolean;
    status: "TRIAL_ACTIVE" | "TRIAL_EXPIRED" | "SUBSCRIPTION_ACTIVE" | "SUSPENDED";
    expiresAt?: string | null;
    message?: string | null;
  };
};

import { useAuthFetch } from "@/hooks/use-auth-fetch";

export default function ProjectEditPage() {
  const params = useParams<{ id?: string }>();
  const isNew = !params.id || params.id === "new";
  const projectId = isNew ? null : params.id;

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authFetch = useAuthFetch();
  const { dbUser, user } = useAuth();
  
  const isDemo = projectId === "00000000-0000-4000-8000-000000000000" || projectId === "demo";
  const isAdmin = dbUser?.role === "admin" || dbUser?.role === "super_admin";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [isBillingOpen, setIsBillingOpen] = useState(false);

  const getInitialTab = () => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const urlTab = searchParams.get("tab");
      if (urlTab === "workspace") {
        return "overview";
      }
      if (urlTab === "widget-studio" || urlTab === "deployment" || urlTab === "api-keys") {
        return "website-connected";
      }
      if (urlTab) return urlTab;
    }
    if (projectId) {
      const saved = getSavedProjectTab(projectId);
      if (saved === "workspace") {
        return "overview";
      }
      if (saved === "widget-studio" || saved === "deployment" || saved === "api-keys") {
        return "website-connected";
      }
      if (saved) return saved;
    }
    return "overview";
  };

  const getInitialWebsiteConnectedSubtab = (): "widget-studio" | "deployment" | "api-keys" => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const subtab = searchParams.get("subtab");
      if (subtab === "widget-studio" || subtab === "deployment" || subtab === "api-keys") {
        return subtab;
      }
      const urlTab = searchParams.get("tab");
      if (urlTab === "widget-studio" || urlTab === "deployment" || urlTab === "api-keys") {
        return urlTab;
      }
    }
    return "widget-studio";
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [websiteConnectedSubtab, setWebsiteConnectedSubtab] = useState<"widget-studio" | "deployment" | "api-keys">(getInitialWebsiteConnectedSubtab);

  useEffect(() => {
    const tabToSet = getInitialTab();
    setActiveTab(tabToSet);
    setWebsiteConnectedSubtab(getInitialWebsiteConnectedSubtab());
  }, [projectId]);

  const handleTabChange = (tab: string, subtab?: string) => {
    if (tab === "workspace") {
      tab = "overview";
    }
    if (tab === "widget-studio" || tab === "deployment" || tab === "api-keys") {
      setActiveTab("website-connected");
      setWebsiteConnectedSubtab(tab);
      if (projectId) {
        saveProjectTab(projectId, "website-connected");
      }
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", "website-connected");
        url.searchParams.set("subtab", tab);
        window.history.replaceState(null, "", url.toString());
      }
      return;
    }

    if (tab === "website-connected" && subtab) {
      setActiveTab("website-connected");
      setWebsiteConnectedSubtab(subtab as any);
      if (projectId) {
        saveProjectTab(projectId, "website-connected");
      }
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", "website-connected");
        url.searchParams.set("subtab", subtab);
        window.history.replaceState(null, "", url.toString());
      }
      return;
    }

    setActiveTab(tab);
    if (projectId) {
      saveProjectTab(projectId, tab);
    }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      url.searchParams.delete("subtab");
      window.history.replaceState(null, "", url.toString());
    }
  };

  const { prefetchTab, getTabTriggerProps } = useProjectTabPrefetch(projectId, activeTab);

  const { data: project, isLoading, isError, error } = useQuery<Project, { status?: number; message?: string }>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}`));
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const err = new Error(errJson.error || errJson.message || "Failed to load project") as any;
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    enabled: !isNew && !!projectId,
    retry: (failureCount, err: any) => {
      if (err?.status === 403 || err?.status === 404) return false;
      return failureCount < 2;
    }
  });

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? "");
      setSystemPrompt(project.systemPrompt);
    }
  }, [project]);

  const { data: readinessData } = useQuery({
    queryKey: ["project-readiness", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/go-live/readiness`));
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!projectId && !isNew,
  });

  const { data: discoveryData } = useQuery({
    queryKey: ["discovery-status", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/discovery/status`));
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!projectId && !isNew,
    refetchInterval: (query) => {
      const s = query.state.data?.discoveryStatus;
      return (s === "PENDING" || s === "ANALYZING") ? 2500 : false;
    },
  });

  const { data: projectUnreadData } = useQuery({
    queryKey: ["project-notifications-unread", projectId],
    queryFn: async () => {
      if (!projectId || projectId === "new") return { unreadCount: 0 };
      try {
        const res = await authFetch(apiUrl(`/api/projects/${projectId}/notifications/unread-count`));
        if (res.ok) {
          const data = await res.json();
          return { unreadCount: Number(data.unreadCount || 0) };
        }
      } catch {
        // Safe fallback
      }
      return { unreadCount: 0 };
    },
    enabled: !!projectId && !isNew,
    refetchInterval: 15000,
  });

  const projectUnreadCount = projectUnreadData?.unreadCount ?? 0;

  const [isStartingAnalysis, setIsStartingAnalysis] = useState(false);

  const handleStartAnalysis = async () => {
    if (!projectId || projectId === "new") return;
    if (isDemo) {
      toast({
        title: "Demo Project (Read-Only)",
        description: "Website analysis is simulated in demo mode and already complete.",
      });
      handleTabChange("overview");
      return;
    }

    const targetUrl = project?.websiteUrl || readinessData?.productionWebsiteUrl;
    if (!targetUrl) {
      toast({
        title: "No Website Connected",
        description: "Please connect your website URL first before running AI analysis.",
        variant: "destructive",
      });
      handleTabChange("settings");
      return;
    }

    setIsStartingAnalysis(true);
    try {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/discovery/start`), {
        method: "POST",
        body: JSON.stringify({ url: targetUrl }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to start website analysis");
      }
      toast({
        title: "AI Analysis Started 🚀",
        description: `NOVA AI is discovering pages, business identity, and capabilities from ${targetUrl}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["discovery-status", projectId] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard", projectId] });
      handleTabChange("overview");
    } catch (e: any) {
      toast({
        title: "Analysis Failed to Start",
        description: e.message || "Unable to start analysis. Please check your website URL.",
        variant: "destructive",
      });
    } finally {
      setIsStartingAnalysis(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; systemPrompt: string }) => {
      const res = await authFetch(apiUrl("/api/projects"), {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to create project");
      }
      return res.json() as Promise<Project>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
      setSavedToken(data.shareToken);
      toast({ title: "Project created!", description: "Your shareable chatbot is ready." });
      setLocation(`/projects/${data.id}/edit`);
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<{ name: string; description: string; systemPrompt: string }>) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}`), {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update project");
      return res.json() as Promise<Project>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["admin-project", projectId] });
      toast({ title: "Project saved!" });
    },
    onError: () => toast({ title: "Failed to save project", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      toast({
        title: "Demo Project (Read-Only)",
        description: "Project settings modifications are disabled in demo mode. Connect your own website to create a live project.",
      });
      return;
    }
    if (!name.trim()) {
      toast({ title: "Project name is required", variant: "destructive" });
      return;
    }
    if (!systemPrompt.trim()) {
      toast({ title: "Knowledge & instructions are required", variant: "destructive" });
      return;
    }
    if (isNew) {
      createMutation.mutate({ name, description, systemPrompt });
    } else {
      updateMutation.mutate({ name, description, systemPrompt });
    }
  };

  const shareUrl = savedToken
    ? `${window.location.origin}${basePath}/p/${savedToken}`
    : project
      ? `${window.location.origin}${basePath}/p/${project.shareToken}`
      : null;

  const copyShareLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    toast({ title: "Share link copied!" });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const { data: reports, refetch: refetchReports } = useQuery({
    queryKey: ["reports", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/reports/project/${projectId}`));
      if (!res.ok) throw new Error("Failed to load reports");
      return res.json() as Promise<{ id: string; title: string; contentUrl: string; createdAt: string }[]>;
    },
    enabled: !!projectId && projectId !== "new",
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const generateReport = async () => {
    if (!projectId || projectId === "new") return;
    setIsGenerating(true);
    try {
      const res = await authFetch(apiUrl("/api/reports/generate"), {
        method: "POST",
        body: JSON.stringify({ projectId })
      });
      if (!res.ok) throw new Error("Generation failed");
      await refetchReports();
      toast({ title: "Report Generated", description: "Your summary report is ready." });
    } catch (err) {
      toast({ title: "Error", description: "Failed to generate report", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  // When creating a new project, show the guided onboarding wizard
  if (isNew) {
    return <OnboardingWizard />;
  }

  // Handle loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading workspace...</p>
      </div>
    );
  }

  // Handle Error / Forbidden / Not Found state without frontend crash
  if (!isNew && (isError || !project)) {
    const errStatus = (error as any)?.status;
    const errMsg = (error as Error)?.message || "";
    const isForbidden = errStatus === 403 || errMsg.toLowerCase().includes("forbidden") || errMsg.toLowerCase().includes("access denied");
    const isNotFound = errStatus === 404 || errMsg.toLowerCase().includes("not found");

    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl space-y-4">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            {isForbidden ? <ShieldAlert className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
          </div>
          <h2 className="text-2xl font-bold text-foreground">
            {isForbidden ? "403 Access Denied" : isNotFound ? "404 Project Not Found" : "Unable to Load Project"}
          </h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            {isForbidden
              ? "You do not have permission to view or edit this project."
              : isNotFound
              ? "The requested project could not be found or has been removed."
              : errMsg || "An error occurred while attempting to load the project."}
          </p>
          <div className="pt-4">
            <Button onClick={() => setLocation("/projects")} variant="default" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Return to Projects
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 w-full min-w-0 px-6 py-6 md:px-8 lg:px-10">
        {/* Demo Mode Top Action Banner */}
        {isDemo && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-primary/15 border border-amber-500/30 backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-foreground text-sm md:text-base">
                    🧪 Interactive Demo Project — Apex Dynamics Consulting
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30 font-semibold">
                    Safe Sandbox
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You are exploring a realistic NOVA project. Real external mutations and live API calls are disabled.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/projects")}
                className="text-xs font-semibold gap-1.5 flex-1 md:flex-initial border-amber-500/30 hover:bg-amber-500/10"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Exit Demo
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setLocation("/projects/new")}
                className="text-xs font-semibold gap-1.5 bg-gradient-to-r from-primary to-orange-500 hover:opacity-90 text-white shadow-md flex-1 md:flex-initial"
              >
                <Globe className="w-3.5 h-3.5" /> Connect My Website
              </Button>
            </div>
          </div>
        )}

        {/* Project Command Center Header */}
        {(() => {
          const storedUrl = project?.websiteUrl || readinessData?.productionWebsiteUrl || null;
          const isLocalDev = !storedUrl || storedUrl.includes("localhost") || storedUrl.includes("127.0.0.1");
          const isLive = !!storedUrl && !isLocalDev && (project?.isActive || project?.status === "active" || readinessData?.environment === "PRODUCTION");
          
          const isDiscoveryReady = discoveryData?.discoveryStatus === "READY" || discoveryData?.discoveryStatus === "COMPLETED";
          const isDiscoveryFailed = discoveryData?.discoveryStatus === "FAILED";
          const isAnalyzing = discoveryData?.discoveryStatus === "ANALYZING" || discoveryData?.discoveryStatus === "PENDING" || isStartingAnalysis;

          let setupPercent = 25;
          if (storedUrl) setupPercent += 25;
          if (isDiscoveryReady) setupPercent += 25;
          if (isLive || project?.isActive) setupPercent += 25;

          return (
            <div className="space-y-6 mb-8">
              {/* Top Banner Row: Project Name, URL, Status & Primary Actions */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-2xl bg-card border border-border/80 shadow-xs">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground tracking-tight truncate">
                      {project?.name || name || "Project Workspace"}
                    </h1>
                    <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-primary/10 text-primary border-primary/20 rounded-full">
                      Setup {setupPercent}% Complete
                    </Badge>
                  </div>

                  <p className="text-xs md:text-sm text-muted-foreground font-medium">
                    Manage and monitor your AI business assistant
                  </p>

                  <div className="pt-0.5 flex items-center gap-2 text-xs">
                    {isLocalDev ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md border border-border text-[11px] font-mono">
                        <Laptop className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Development ({storedUrl || "localhost:3000"})</span>
                      </span>
                    ) : (
                      <a
                        href={storedUrl!}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium truncate text-xs"
                      >
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{storedUrl}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-75" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Right Action Controls: Live Status, Visit Site & Project Header Notification Bell */}
                <div className="flex items-center gap-2.5 shrink-0 self-start lg:self-center">
                  {isLive ? (
                    <div className="flex items-center gap-2.5">
                      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-semibold px-3 py-1 gap-1.5 rounded-full text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Live
                      </Badge>
                      {storedUrl && (
                        <Button
                          onClick={() => window.open(storedUrl, "_blank")}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 px-4 rounded-xl gap-1.5 shadow-xs"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Visit Site
                        </Button>
                      )}
                    </div>
                  ) : !isLocalDev && storedUrl ? (
                    <Button
                      onClick={() => handleTabChange("deployment")}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 px-5 rounded-xl gap-1.5 shadow-xs"
                    >
                      <Rocket className="w-3.5 h-3.5" /> Deploy Assistant
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => handleTabChange("deployment")}
                      className="border-border text-foreground hover:bg-accent font-semibold text-xs h-9 px-4 rounded-xl gap-1.5"
                    >
                      <Laptop className="w-3.5 h-3.5" /> Test Locally
                    </Button>
                  )}

                  {/* Project Header Notifications Bell */}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => handleTabChange("notifications")}
                    {...getTabTriggerProps("notifications")}
                    aria-label={projectUnreadCount > 0 ? `Project notifications (${projectUnreadCount} unread)` : "Project notifications"}
                    title={projectUnreadCount > 0 ? `Notifications (${projectUnreadCount} unread)` : "Notifications"}
                    data-testid="project-header-notification-bell"
                    className={`h-9 w-9 rounded-xl relative transition-all border-border/80 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary ${
                      activeTab === "notifications"
                        ? "bg-primary text-primary-foreground border-primary shadow-xs ring-2 ring-primary/40"
                        : "bg-secondary/40 text-muted-foreground"
                    }`}
                  >
                    <Bell className="w-4 h-4" />
                    {projectUnreadCount > 0 && (
                      <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center animate-in zoom-in shadow-xs pointer-events-none ${
                        activeTab === "notifications"
                          ? "bg-foreground text-background"
                          : "bg-primary text-primary-foreground"
                      }`}>
                        {projectUnreadCount > 99 ? "99+" : projectUnreadCount}
                      </span>
                    )}
                  </Button>
                </div>
              </div>

              {/* Grid: Vertical Setup Checklist (Step 1, Step 2, Step 3) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* 1. Website Connected */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleTabChange("website-connected")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleTabChange("website-connected");
                    }
                  }}
                  aria-label="Open Website Connected setup"
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    activeTab === "website-connected"
                      ? "bg-primary/10 border-primary ring-2 ring-primary/40 shadow-xs"
                      : storedUrl
                      ? "bg-card border-emerald-500/30 hover:border-emerald-500/50 hover:bg-card/90"
                      : "bg-card border-border/80 hover:border-primary/50 hover:bg-card/90"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Step 1</span>
                    {storedUrl ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px] px-2 py-0.5 rounded-full">
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full text-muted-foreground border-border">
                        Pending
                      </Badge>
                    )}
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary shrink-0" />
                      Website Connected
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {storedUrl ? storedUrl : "Widget Studio, Deployment & API Keys"}
                    </p>
                  </div>
                </div>

                {/* 2. Knowledge Base */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleTabChange("knowledge")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleTabChange("knowledge");
                    }
                  }}
                  aria-label="Open Knowledge Base"
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    activeTab === "knowledge"
                      ? "bg-primary/10 border-primary ring-2 ring-primary/40 shadow-xs"
                      : isDiscoveryReady || project
                      ? "bg-card border-emerald-500/30 hover:border-emerald-500/50 hover:bg-card/90"
                      : "bg-card border-border/80 hover:border-primary/50 hover:bg-card/90"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Step 2</span>
                    {isDiscoveryReady || project ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px] px-2 py-0.5 rounded-full">
                        Ready
                      </Badge>
                    ) : isAnalyzing ? (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] px-2 py-0.5 rounded-full animate-pulse">
                        Analyzing...
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full text-muted-foreground border-border">
                        Setup
                      </Badge>
                    )}
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
                      <Database className="w-4 h-4 text-primary shrink-0" />
                      Knowledge Base
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {isDiscoveryReady ? "Automated discovery complete" : "RAG & business context sources"}
                    </p>
                  </div>
                </div>

                {/* 3. Connected Website */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    const rawUrl = project?.websiteUrl || readinessData?.productionWebsiteUrl || null;
                    if (!rawUrl || !rawUrl.trim()) {
                      toast({
                        title: "No Website Connected",
                        description: "This project does not have a configured website URL yet. You can connect one in project settings.",
                        variant: "destructive",
                      });
                      return;
                    }

                    let urlToOpen = rawUrl.trim();
                    if (!/^https?:\/\//i.test(urlToOpen)) {
                      urlToOpen = `http://${urlToOpen}`;
                    }

                    try {
                      const parsed = new URL(urlToOpen);
                      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                        toast({
                          title: "Unsupported Protocol",
                          description: "Only HTTP and HTTPS website URLs are supported.",
                          variant: "destructive",
                        });
                        return;
                      }
                      window.open(parsed.href, "_blank", "noopener,noreferrer");
                    } catch {
                      toast({
                        title: "Invalid Website URL",
                        description: `"${rawUrl}" is not a valid website URL. Please verify your project settings.`,
                        variant: "destructive",
                      });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      const rawUrl = project?.websiteUrl || readinessData?.productionWebsiteUrl || null;
                      if (!rawUrl || !rawUrl.trim()) {
                        toast({
                          title: "No Website Connected",
                          description: "This project does not have a configured website URL yet.",
                          variant: "destructive",
                        });
                        return;
                      }
                      let urlToOpen = rawUrl.trim();
                      if (!/^https?:\/\//i.test(urlToOpen)) {
                        urlToOpen = `http://${urlToOpen}`;
                      }
                      try {
                        const parsed = new URL(urlToOpen);
                        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                          toast({ title: "Unsupported Protocol", description: "Only HTTP/HTTPS URLs supported.", variant: "destructive" });
                          return;
                        }
                        window.open(parsed.href, "_blank", "noopener,noreferrer");
                      } catch {
                        toast({ title: "Invalid URL", description: "Please verify website URL in settings.", variant: "destructive" });
                      }
                    }
                  }}
                  aria-label="Open connected website in new tab"
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isLive
                      ? "bg-card border-emerald-500/30 hover:border-emerald-500/50 hover:bg-card/90"
                      : storedUrl
                      ? "bg-card border-border/80 hover:border-primary/50 hover:bg-card/90"
                      : "bg-card border-border/80 hover:border-primary/50 hover:bg-card/90 opacity-90"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Step 3</span>
                    {isLive ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live
                      </Badge>
                    ) : storedUrl ? (
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full text-muted-foreground border-border flex items-center gap-1">
                        <ExternalLink className="w-2.5 h-2.5" />
                        Open Site
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full text-muted-foreground border-border">
                        Not Configured
                      </Badge>
                    )}
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
                      <ExternalLink className="w-4 h-4 text-primary shrink-0" />
                      Connected Website
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {storedUrl ? storedUrl : "Click to connect domain in settings"}
                    </p>
                  </div>
                </div>

              </div>
            </div>
          );
        })()}

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          {/* Grouped Navigation Header */}
          <div className="space-y-4 mb-6">
            {/* Category Group Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {PROJECT_NAV_GROUPS.map((group) => {
                const GroupIcon = group.icon;
                const isGroupActive = group.items.some((item) => item.id === activeTab);
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => {
                      if (!isGroupActive) {
                        handleTabChange(group.items[0].id);
                      }
                    }}
                    className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      isGroupActive
                        ? "bg-primary/15 border-primary/40 shadow-xs text-foreground"
                        : "bg-card/50 border-border/60 hover:bg-card/80 hover:border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isGroupActive ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                    }`}>
                      <GroupIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold truncate">{group.title}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0.2 rounded-full font-mono shrink-0">
                          {group.items.length}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {group.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Sub-Tab Navigation Bar for Active Category */}
            {(() => {
              const isWebsiteConnected =
                activeTab === "website-connected" ||
                activeTab === "widget-studio" ||
                activeTab === "deployment" ||
                activeTab === "api-keys";

              const isNotifications = activeTab === "notifications";

              const activeGroup = PROJECT_NAV_GROUPS.find((g) => g.items.some((item) => item.id === activeTab)) || PROJECT_NAV_GROUPS[0];

              const websiteConnectedTabs = [
                { id: "widget-studio", label: "Widget Studio", icon: Paintbrush },
                { id: "deployment", label: "Deployment", icon: Share2 },
                { id: "api-keys", label: "API Keys", icon: Key },
              ];

              return (
                <div className="bg-card/80 border border-border p-1.5 rounded-2xl backdrop-blur-xl shadow-xs flex items-center justify-between gap-2">
                  <TabsList className="bg-transparent border-0 p-0 h-auto flex flex-wrap sm:flex-nowrap gap-1.5 w-full justify-start no-scrollbar">
                    {isWebsiteConnected ? (
                      websiteConnectedTabs.map((item) => {
                        const Icon = item.icon;
                        const isSubActive = websiteConnectedSubtab === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleTabChange("website-connected", item.id)}
                            {...getTabTriggerProps(item.id)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                              isSubActive
                                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span>{item.label}</span>
                          </button>
                        );
                      })
                    ) : isNotifications ? (
                      <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-primary/15 text-primary text-xs font-semibold border border-primary/30">
                        <Bell className="w-3.5 h-3.5 shrink-0" />
                        <span>Smart Notification Center</span>
                      </div>
                    ) : (
                      activeGroup.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <TabsTrigger
                            key={item.id}
                            value={item.id}
                            {...getTabTriggerProps(item.id)}
                            className="px-3.5 py-2 rounded-xl text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all gap-2 shrink-0"
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span>{item.label}</span>
                          </TabsTrigger>
                        );
                      })
                    )}
                  </TabsList>

                  {/* Dropdown Menu to jump to any tab directly */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground rounded-xl gap-1.5 shrink-0 border border-border/50 bg-secondary/30">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                        <span className="hidden sm:inline font-medium">All Navigation</span>
                        <ChevronDown className="w-3 h-3 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 p-2 rounded-2xl bg-popover border-border z-50 max-h-96 overflow-y-auto">
                      {/* Setup Shortcuts */}
                      <div className="py-1">
                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b border-border/40 mb-1">
                          <Compass className="w-3 h-3 text-primary" />
                          <span>Setup Shortcuts</span>
                        </div>
                        <DropdownMenuItem
                          onClick={() => handleTabChange("website-connected")}
                          className={`cursor-pointer rounded-xl text-xs py-2 px-2.5 flex items-center justify-between gap-2 my-0.5 ${
                            activeTab === "website-connected" ? "bg-primary/15 text-primary font-semibold" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Globe className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            <span>Website Connected (Step 1)</span>
                          </div>
                          {activeTab === "website-connected" && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleTabChange("knowledge")}
                          className={`cursor-pointer rounded-xl text-xs py-2 px-2.5 flex items-center justify-between gap-2 my-0.5 ${
                            activeTab === "knowledge" ? "bg-primary/15 text-primary font-semibold" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Database className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            <span>Knowledge Base (Step 2)</span>
                          </div>
                          {activeTab === "knowledge" && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                        </DropdownMenuItem>
                      </div>

                      {PROJECT_NAV_GROUPS.map((group) => (
                        <div key={group.id} className="py-1">
                          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b border-border/40 mb-1">
                            <group.icon className="w-3 h-3 text-primary" />
                            <span>{group.title}</span>
                          </div>
                          {group.items.map((item) => {
                            const ItemIcon = item.icon;
                            const isSelected = activeTab === item.id;
                            return (
                              <DropdownMenuItem
                                key={item.id}
                                onClick={() => handleTabChange(item.id)}
                                className={`cursor-pointer rounded-xl text-xs py-2 px-2.5 flex items-center justify-between gap-2 my-0.5 ${
                                  isSelected ? "bg-primary/15 text-primary font-semibold" : ""
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <ItemIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                  <span>{item.label}</span>
                                </div>
                                {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                              </DropdownMenuItem>
                            );
                          })}
                        </div>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })()}
          </div>

          <TabsContent value="overview">
            <Card className="bg-card border-border text-card-foreground mt-8">
              <CardHeader>
                <CardTitle>Project Dashboard</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Business intelligence and project overview.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {shareUrl && (
                  <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-xl">
                    <p className="text-primary-foreground font-medium text-sm mb-2">
                      Shareable Project Link
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2 font-mono truncate border border-border">
                        {shareUrl}
                      </code>
                      <Button type="button" size="sm" variant="outline" onClick={copyShareLink} className="border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 gap-1.5">
                        <Copy className="w-3 h-3" /> Copy
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => window.open(shareUrl, "_blank")} className="border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 gap-1.5">
                        <Globe className="w-3 h-3" /> Open
                      </Button>
                    </div>
                  </div>
                )}
                
                <br />
                {/* Dashboard Overview */}
                {projectId && <DashboardOverview key={projectId} projectId={projectId} />}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="guide">
            {projectId && <ProjectGuide projectId={projectId} onSelectTab={handleTabChange} />}
          </TabsContent>

          <TabsContent value="chat">
            <Card className="bg-card border-border text-card-foreground mt-8 overflow-hidden h-[600px] flex flex-col">
              <CardHeader className="pb-2 shrink-0">
                <CardTitle>Test Chatbot</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Interact with the AI using your project's knowledge base.
                </CardDescription>
              </CardHeader>
              <div className="flex-1 relative bg-muted w-full overflow-hidden">
                 {shareUrl ? (
                   <iframe src={shareUrl} className="w-full h-full border-0 absolute inset-0" title="Test Chatbot" />
                 ) : (
                   <div className="flex h-full items-center justify-center text-muted-foreground">Share link not available</div>
                 )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="knowledge">
            {projectId && <KnowledgeBase projectId={projectId} />}
          </TabsContent>

          <TabsContent value="reports">
            <Card className="bg-card border-border text-card-foreground mt-8">
              <CardHeader>
                <CardTitle>Project Reports</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Generate summary insights and analytics reports.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex justify-between items-center bg-muted/50 p-4 rounded-xl border border-border">
                  <div>
                    <h4 className="font-semibold text-foreground">Generate New Report</h4>
                    <p className="text-sm text-muted-foreground">Summarize current knowledge base and analytics</p>
                  </div>
                  <Button onClick={generateReport} disabled={isGenerating} className="gap-2">
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    Generate Report
                  </Button>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Past Reports</h4>
                  {reports?.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No reports generated yet.</p>
                  ) : (
                    reports?.map(r => (
                      <div key={r.id} className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border">
                        <div>
                          <p className="font-medium text-sm">{r.title}</p>
                          <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => window.open(r.contentUrl, "_blank")}>
                          View Report
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card className="bg-card border-border text-card-foreground mt-8">
              <CardHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                    Project Scope: {project?.name || "Current Project"}
                  </Badge>
                </div>
                <CardTitle>Project Settings</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Configure this chatbot's persona, system instructions, and identity. Global account options (theme, billing, global API keys) are managed under Workspace Settings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">Project Name</label>
                    <Input
                      placeholder="e.g. Acme Customer Support AI"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-muted border-border"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">Description (Optional)</label>
                    <Input
                      placeholder="e.g. Handles sales and support inquiries for Acme Corp"
                      value={description}
                      onChange={(e: any) => setDescription(e.target.value)}
                      className="bg-muted border-border"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">System Prompt / Instructions</label>
                    <Textarea
                      rows={6}
                      placeholder="Define the bot persona, target audience, tone of voice, and boundary constraints..."
                      value={systemPrompt}
                      onChange={(e: any) => setSystemPrompt(e.target.value)}
                      className="bg-muted border-border font-mono text-sm"
                    />
                  </div>

                  <Button type="submit" disabled={isPending} className="gap-2">
                    {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Changes
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="context-engine">
            {projectId && (
              <div className="mt-8">
                {dbUser?.features?.canUseContextEngine === false && !isAdmin ? (
                  <Card className="bg-card border-border text-card-foreground p-8 text-center">
                    <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-bold text-foreground mb-2">Context Engine Locked</h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      Contact support to enable the Context Engine feature for your account.
                    </p>
                  </Card>
                ) : (
                  <ContextSettings projectId={projectId} />
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="conversations">
            {projectId && (
              <div className="mt-8">
                <VisitorInboxTab projectId={projectId} onSelectTab={handleTabChange} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="website-connected">
            {projectId && (
              <div className="mt-8">
                {websiteConnectedSubtab === "widget-studio" && <WidgetStudio projectId={projectId} />}
                {websiteConnectedSubtab === "deployment" && <Deployment projectId={projectId} />}
                {websiteConnectedSubtab === "api-keys" && <ApiKeys projectId={projectId} />}
              </div>
            )}
          </TabsContent>

          <TabsContent value="widget-studio">
            {projectId && (
              <div className="mt-8">
                <WidgetStudio projectId={projectId} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="channels">
            {projectId && (
              <div className="mt-8">
                <ChannelsManager projectId={projectId} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="deployment">
            {projectId && (
              <div className="mt-8">
                <Deployment projectId={projectId} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="api-keys">
            {projectId && (
              <div className="mt-8">
                <ApiKeys projectId={projectId} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics">
            {projectId && (
              <div className="mt-8">
                <Analytics projectId={projectId} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="notifications">
            {projectId && (
              <div className="mt-8">
                <Notifications key={projectId} projectId={projectId} onSelectTab={handleTabChange} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="integrations">
            {projectId && (
              <div className="mt-8">
                <IntegrationsList projectId={projectId} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="agent-control">
            {projectId && (
              <div className="mt-8">
                <AgentControlCenter projectId={projectId} onSelectTab={handleTabChange} />
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Billing & Subscription Dialog */}
        <Dialog open={isBillingOpen} onOpenChange={setIsBillingOpen}>
          <DialogContent className="max-w-3xl bg-popover border-border text-popover-foreground">
            <DialogHeader>
              <DialogTitle>Project Subscription & Billing</DialogTitle>
            </DialogHeader>
            {projectId && <BillingSection projectId={projectId} />}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
