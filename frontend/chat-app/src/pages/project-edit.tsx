import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, Globe, MessageSquare, Database, LayoutDashboard, Settings, FileText, Paintbrush, Rocket, Key, Pencil, Brain, CreditCard, Sparkles, Share2, Check, Smartphone, ShieldCheck, ShieldAlert, AlertTriangle, ArrowLeft, Compass } from "lucide-react";
import { DashboardOverview } from "../components/project/dashboard-overview";
import { KnowledgeBase } from "../components/project/knowledge-base";
import { WidgetStudio } from "../components/project/widget-studio";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSavedProjectTab, saveProjectTab } from "@/lib/workspace-continuity";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiUrl } from "@/lib/api-url";
import { useProjectTabPrefetch } from "@/hooks/use-tab-prefetch";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type Project = {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  userId: string;
  shareToken: string;
  isActive: boolean;
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
      if (urlTab) return urlTab;
    }
    if (projectId) {
      const saved = getSavedProjectTab(projectId);
      if (saved) return saved;
    }
    return "overview";
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  useEffect(() => {
    const tabToSet = getInitialTab();
    setActiveTab(tabToSet);
  }, [projectId]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (projectId) {
      saveProjectTab(projectId, tab);
    }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url.toString());
    }
  };

  const { prefetchTab, getTabTriggerProps } = useProjectTabPrefetch(projectId, activeTab);

  const { data: project, isLoading, isError, error } = useQuery<{
    id: string;
    name: string;
    description: string | null;
    systemPrompt: string;
    userId: string;
    shareToken: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    entitlement?: {
      allowed: boolean;
      status: "TRIAL_ACTIVE" | "TRIAL_EXPIRED" | "SUBSCRIPTION_ACTIVE" | "SUSPENDED";
      expiresAt?: string | null;
      message?: string | null;
    };
  }, { status?: number; message?: string }>({
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

        <div className="flex items-center gap-6 mb-12">
          <div>
            <div className="flex items-center gap-3">
              {isEditingName ? (
                <Input
                  autoFocus
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onBlur={() => {
                    setIsEditingName(false);
                    if (tempName.trim() && tempName.trim() !== project?.name) {
                      updateMutation.mutate({ name: tempName.trim() });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    } else if (e.key === "Escape") {
                      setTempName(project?.name || name);
                      setIsEditingName(false);
                    }
                  }}
                  className="text-4xl font-bold h-14 bg-transparent border-white/20 focus:border-primary px-2"
                />
              ) : (
                <div 
                  className="flex items-center gap-3 group cursor-pointer" 
                  onClick={() => {
                    if (isDemo) {
                      toast({
                        title: "Demo Mode",
                        description: "Project renaming is disabled in demo mode. Connect your own website to customize your project.",
                      });
                      return;
                    }
                    setTempName(project?.name || name);
                    setIsEditingName(true);
                  }}
                >
                  <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
                    {project?.name || "Loading..."}
                  </h1>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="opacity-100 transition-opacity h-8 w-8 rounded-full hover:bg-white/10" 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isDemo) {
                        toast({
                          title: "Demo Mode",
                          description: "Project renaming is disabled in demo mode. Connect your own website to customize your project.",
                        });
                        return;
                      }
                      setTempName(project?.name || name);
                      setIsEditingName(true);
                    }}
                  >
                    <Pencil className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                  </Button>
                </div>
              )}
            </div>
            
            <p className="text-muted-foreground mt-2 font-medium">
              Update your project settings and knowledge base
            </p>

            {project?.entitlement && (
              <div className="mt-3">
                {project.entitlement.status === "SUBSCRIPTION_ACTIVE" && (
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 gap-1.5 px-3 py-1 text-xs">
                    <ShieldCheck className="w-4 h-4" /> Active Pro Plan
                  </Badge>
                )}
                {project.entitlement.status === "TRIAL_ACTIVE" && (
                  <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/30 gap-1.5 px-3 py-1 text-xs">
                    <Sparkles className="w-4 h-4" /> Free Trial Active
                    {project.entitlement.expiresAt && (
                      <span className="text-muted-foreground/80 font-normal">
                        • Ends {new Date(project.entitlement.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </Badge>
                )}
                {project.entitlement.status === "TRIAL_EXPIRED" && (
                  <div className="mt-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-rose-500 flex items-center gap-2 text-sm">
                        <ShieldAlert className="w-4 h-4" /> Free Trial Expired
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Your chatbot AI generation is currently paused on your website. Upgrade your plan to keep your widget active.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 shadow-md flex-none"
                      onClick={() => setLocation("/billing")}
                    >
                      <CreditCard className="w-3.5 h-3.5" /> Upgrade Plan
                    </Button>
                  </div>
                )}
                {project.entitlement.status === "SUSPENDED" && (
                  <Badge variant="destructive" className="gap-1.5 px-3 py-1 text-xs">
                    <ShieldAlert className="w-4 h-4" /> Project Access Suspended
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="mb-8 bg-muted/60 border border-border p-1.5 w-full flex overflow-x-auto justify-start h-14 rounded-2xl backdrop-blur-xl no-scrollbar scroll-smooth">
            <TabsTrigger value="overview" {...getTabTriggerProps("overview")} className="shrink-0 flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <LayoutDashboard className="w-4 h-4 mr-2" /> Overview
            </TabsTrigger>
            <TabsTrigger value="guide" {...getTabTriggerProps("guide")} className="shrink-0 flex-1 min-w-[140px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <Compass className="w-4 h-4 mr-2 text-primary" /> Project Guide
            </TabsTrigger>
            <TabsTrigger value="chat" className="shrink-0 flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <MessageSquare className="w-4 h-4 mr-2" /> Test Chat
            </TabsTrigger>
            <TabsTrigger value="knowledge" {...getTabTriggerProps("knowledge")} className="shrink-0 flex-1 min-w-[140px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <Database className="w-4 h-4 mr-2" /> Knowledge Base
            </TabsTrigger>
            <TabsTrigger value="reports" {...getTabTriggerProps("reports")} className="shrink-0 flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <FileText className="w-4 h-4 mr-2" /> Reports
            </TabsTrigger>
            <TabsTrigger value="settings" {...getTabTriggerProps("settings")} className="shrink-0 flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <Settings className="w-4 h-4 mr-2" /> Settings
            </TabsTrigger>
            <TabsTrigger value="context-engine" {...getTabTriggerProps("context-engine")} className="shrink-0 flex-1 min-w-[150px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <Brain className="w-4 h-4 mr-2" /> Context Engine
            </TabsTrigger>
            <TabsTrigger value="widget-studio" {...getTabTriggerProps("widget-studio")} className="shrink-0 flex-1 min-w-[150px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <Paintbrush className="w-4 h-4 mr-2" /> Widget Studio
            </TabsTrigger>
            <TabsTrigger value="channels" {...getTabTriggerProps("channels")} className="shrink-0 flex-1 min-w-[150px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <Smartphone className="w-4 h-4 mr-2" /> Channels
            </TabsTrigger>
            <TabsTrigger value="deployment" {...getTabTriggerProps("deployment")} className="shrink-0 flex-1 min-w-[140px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <Rocket className="w-4 h-4 mr-2" /> Deployment
            </TabsTrigger>
            <TabsTrigger value="api-keys" {...getTabTriggerProps("api-keys")} className="shrink-0 flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <Key className="w-4 h-4 mr-2" /> API Keys
            </TabsTrigger>
            <TabsTrigger value="analytics" {...getTabTriggerProps("analytics")} className="shrink-0 flex-1 min-w-[130px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <LayoutDashboard className="w-4 h-4 mr-2" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="notifications" {...getTabTriggerProps("notifications")} className="shrink-0 flex-1 min-w-[130px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <AlertTriangle className="w-4 h-4 mr-2" /> Notifications
            </TabsTrigger>
            <TabsTrigger value="integrations" {...getTabTriggerProps("integrations")} className="shrink-0 flex-1 min-w-[140px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <Sparkles className="w-4 h-4 mr-2" /> Integrations
            </TabsTrigger>
          </TabsList>

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
                {projectId && <DashboardOverview projectId={projectId} />}
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
                <CardTitle>Project Settings</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Configure your chatbot's identity and core instructions.
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
                <Notifications projectId={projectId} onSelectTab={handleTabChange} />
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
