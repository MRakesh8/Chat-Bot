import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Copy, Globe, MessageSquare, Database, LayoutDashboard, Settings, FileText, Paintbrush, Rocket, Key, Pencil, Brain, CreditCard, Shield, CheckCircle2, Sparkles, Download, Share2, Check } from "lucide-react";
import { KnowledgeBase } from "../components/project/knowledge-base";
import { WidgetStudio } from "../components/project/widget-studio";
import { Deployment } from "../components/project/deployment";
import { ApiKeys } from "../components/project/api-keys";
import { Analytics } from "../components/project/analytics";
import { ContextSettings } from "../components/project/context-settings";
import { supabase } from "@/lib/supabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiUrl } from "@/lib/api-url";

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
};

function useAuthFetch() {
  const { session } = useAuth();
  return async (url: string, options: RequestInit = {}) => {
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
}

export default function AdminProjectEditPage() {
  const params = useParams<{ id?: string }>();
  const isNew = !params.id || params.id === "new";
  const projectId = isNew ? null : params.id;

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authFetch = useAuthFetch();
  const { dbUser } = useAuth();
  
  const isAdmin = dbUser?.role === "admin" || dbUser?.role === "super_admin";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");

  const { data: project, isLoading } = useQuery({
    queryKey: ["admin-project", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}`));
      if (!res.ok) throw new Error("Failed to load project");
      return res.json() as Promise<Project>;
    },
    enabled: !isNew && !!projectId,
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
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
      setSavedToken(data.shareToken);
      toast({ title: "Project created!", description: "Your shareable chatbot is ready." });
      setLocation(`/admin/projects/${data.id}/edit`);
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
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
      queryClient.invalidateQueries({ queryKey: ["admin-project", projectId] });
      toast({ title: "Project saved!" });
    },
    onError: () => toast({ title: "Failed to save project", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <>
      <div className="flex-1 w-full min-w-0 px-6 py-6 md:px-8 lg:px-10">
        <div className="flex items-center gap-6 mb-12">
          <div>
            {isNew ? (
              <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 tracking-tight">
                New Project
              </h1>
            ) : (
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
                    onClick={() => { setTempName(project?.name || name); setIsEditingName(true); }}
                  >
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 tracking-tight">
                      {project?.name || "Loading..."}
                    </h1>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="opacity-100 transition-opacity h-8 w-8 rounded-full hover:bg-white/10" 
                      onClick={(e) => { e.stopPropagation(); setTempName(project?.name || name); setIsEditingName(true); }}
                    >
                      <Pencil className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                    </Button>
                  </div>
                )}
              </div>
            )}
            <p className="text-muted-foreground mt-2 font-medium">
              {isNew
                ? "Build a custom AI assistant with your own knowledge"
                : "Update your project settings and knowledge"}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : (
          <Tabs defaultValue={isNew ? "settings" : "overview"} className="w-full">
            <TabsList className="mb-8 bg-white/[0.02] border border-white/[0.05] p-1.5 w-full flex overflow-x-auto justify-start h-14 rounded-2xl backdrop-blur-xl">
              <TabsTrigger value="overview" className="flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
                <LayoutDashboard className="w-4 h-4 mr-2" /> Overview
              </TabsTrigger>
              <TabsTrigger value="chat" className="flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
                <MessageSquare className="w-4 h-4 mr-2" /> Test Chat
              </TabsTrigger>
              <TabsTrigger value="knowledge" className="flex-1 min-w-[140px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
                <Database className="w-4 h-4 mr-2" /> Knowledge Base
              </TabsTrigger>
              <TabsTrigger value="reports" className="flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
                <FileText className="w-4 h-4 mr-2" /> Reports
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="context-engine" className="flex-1 min-w-[150px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
                <Brain className="w-4 h-4 mr-2" />
                Context Engine
              </TabsTrigger>
              <TabsTrigger value="widget-studio" className="flex-1 min-w-[150px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
                <Paintbrush className="w-4 h-4 mr-2" /> Widget Studio
              </TabsTrigger>
              <TabsTrigger value="deployment" className="flex-1 min-w-[140px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
                <Rocket className="w-4 h-4 mr-2" /> Deployment
              </TabsTrigger>
              <TabsTrigger value="api-keys" className="flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
                <Key className="w-4 h-4 mr-2" /> API Keys
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex-1 min-w-[130px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
                <LayoutDashboard className="w-4 h-4 mr-2" /> Analytics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              {isNew ? (
                <div className="text-center py-12 bg-muted border border-border rounded-xl mt-8">
                  <LayoutDashboard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Create Project First</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">You need to save the project settings before you can view the overview.</p>
                </div>
              ) : (
                <Card className="bg-card border-border text-card-foreground mt-8">
                <CardHeader>
                  <CardTitle>Project Overview</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Quick stats and access to your project.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-muted border border-border rounded-lg p-4">
                      <h3 className="text-muted-foreground text-sm font-medium mb-1">Status</h3>
                      <p className="text-xl font-semibold text-foreground flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        Active
                      </p>
                    </div>
                  </div>
                  {shareUrl && (
                    <div className="mt-6 p-4 bg-primary/10 border border-primary/20 rounded-xl">
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
                </CardContent>
              </Card>
              )}
            </TabsContent>

            <TabsContent value="chat">
              {isNew ? (
                <div className="text-center py-12 bg-muted border border-border rounded-xl mt-8">
                  <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Create Project First</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">You need to save the project settings before you can test the chat.</p>
                </div>
              ) : (
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
              )}
            </TabsContent>

            <TabsContent value="knowledge">
              {isNew ? (
                <div className="text-center py-12 bg-muted border border-border rounded-xl mt-8">
                  <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Create Project First</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">You need to save the project settings before you can upload knowledge base documents (PDF, PPT, Text, etc).</p>
                </div>
              ) : (
                <KnowledgeBase projectId={projectId!} />
              )}
            </TabsContent>

            <TabsContent value="reports">
              {isNew ? (
                <div className="text-center py-12 bg-muted border border-border rounded-xl mt-8">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Create Project First</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">You need to save the project settings before you can view reports.</p>
                </div>
              ) : (
                <Card className="bg-card border-border text-card-foreground mt-8">
                <CardHeader>
                  <CardTitle>Project Reports</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Generate an AI summary report based on all project knowledge.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Button
                    onClick={generateReport}
                    disabled={isGenerating || projectId === "new" || !projectId}
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-primary-foreground border-0 gap-2 px-6"
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    {isGenerating ? "Generating Report..." : "Generate Project Summary"}
                  </Button>

                  <div className="mt-8 space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground border-b border-border pb-2">Past Reports</h3>
                    {reports && reports.length > 0 ? (
                      <div className="space-y-2">
                        {reports.map((report) => (
                          <div key={report.id} className="flex items-center justify-between bg-muted border border-border p-3 rounded-lg">
                            <div>
                              <p className="text-sm font-medium text-foreground">{report.title}</p>
                              <p className="text-xs text-muted-foreground">{new Date(report.createdAt).toLocaleString()}</p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-border bg-card hover:bg-muted text-foreground"
                              onClick={() => window.open(report.contentUrl, "_blank")}
                            >
                              Download Report
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-muted border border-border rounded-lg">
                        <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm">No reports generated yet.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              )}
            </TabsContent>

            <TabsContent value="widget-studio">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-medium mb-1">Widget Studio</h3>
                  <p className="text-white/60 text-sm">Customize the appearance and behavior of your chatbot widget.</p>
                </div>
                {projectId && <WidgetStudio projectId={projectId} />}
              </div>
            </TabsContent>

            <TabsContent value="context-engine">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-medium mb-1">Context Engine</h3>
                  <p className="text-white/60 text-sm">Configure how the AI understands and interacts with your website.</p>
                </div>
                {dbUser?.features?.canUseContextEngine === false && !isAdmin ? (
                  <div className="text-center py-16 bg-muted/50 border border-border rounded-xl mt-8">
                    <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium text-foreground mb-2">Premium Feature Locked</h3>
                    <p className="text-muted-foreground max-w-md mx-auto">Contact Admin (rakesh837m@gmail.com) to enable this feature. For more detail about admin ask chatbot.</p>
                  </div>
                ) : (
                  projectId && <ContextSettings projectId={projectId} />
                )}
              </div>
            </TabsContent>

            <TabsContent value="deployment">
              {isNew ? (
                <div className="text-center py-12 bg-muted border border-border rounded-xl mt-8">
                  <Rocket className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Create Project First</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">You need to save the project settings before you can deploy the widget.</p>
                </div>
              ) : (
                <DeploymentPaywall projectId={projectId!} isAdmin={isAdmin} authFetch={authFetch} toast={toast} />
              )}
            </TabsContent>

            <TabsContent value="api-keys">
              {isNew ? (
                <div className="text-center py-12 bg-muted border border-border rounded-xl mt-8">
                  <Key className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Create Project First</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">You need to save the project settings before you can manage API keys.</p>
                </div>
              ) : (
                <ApiKeys projectId={projectId!} />
              )}
            </TabsContent>

            <TabsContent value="analytics">
              {isNew ? (
                <div className="text-center py-12 bg-muted border border-border rounded-xl mt-8">
                  <LayoutDashboard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Create Project First</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">You need to save the project settings before you can view widget analytics.</p>
                </div>
              ) : (
                <Analytics projectId={projectId!} />
              )}
            </TabsContent>

              <TabsContent value="settings">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Project Name *</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Customer Support Bot, Sales Assistant"
                    className="bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Description <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this chatbot for?"
                    className="bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Project Rules (Custom AI Instructions) *</label>
                  <p className="text-xs text-muted-foreground">
                    Define the rules, context, and tone for the AI in this project. The AI will strictly follow these instructions before giving any response.
                  </p>
                  <Textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Example:\nYou are a helpful support assistant for Acme Corp.\n..."
                    className="bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 min-h-[320px] font-mono text-sm resize-y"
                  />
                  <p className="text-xs text-muted-foreground">{systemPrompt.length.toLocaleString()} characters</p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-primary-foreground border-0 gap-2 px-6"
                  >
                    {isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {isNew ? "Create Project" : "Save Settings"}
                  </Button>
                </div>

                {shareUrl && (
                  <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                    <p className="text-green-600 dark:text-green-400 font-medium text-sm mb-2">
                      {savedToken ? "🎉 Project created! Share this link:" : "Share link"}
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2 font-mono truncate border border-border">
                        {shareUrl}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={copyShareLink}
                        className="border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 gap-1.5"
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(shareUrl, "_blank")}
                        className="border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 gap-1.5"
                      >
                        <Globe className="w-3 h-3" />
                        Open
                      </Button>
                    </div>
                  </div>
                )}
              </form>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  );
}

// --- Deployment Paywall Component ---
function DeploymentPaywall({ projectId, isAdmin, authFetch, toast }: {
  projectId: string;
  isAdmin: boolean;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast: (opts: any) => void;
}) {
  const [isPaying, setIsPaying] = useState(false);
  const [method, setMethod] = useState("Google Pay");
  const [utr, setUtr] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  
  const queryClient = useQueryClient();
  const { dbUser, session } = useAuth();
  
  const { data: paymentInfo, isLoading: isCheckingPayment } = useQuery({
    queryKey: ["payment-status", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/payments/status/${projectId}`));
      if (!res.ok) throw new Error("Failed to check payment status");
      return res.json() as Promise<{ status: string, licenseStatus: string, upiId?: string, qrCodeUrl?: string }>;
    },
    enabled: !!projectId,
  });

  const hasActiveLicense = paymentInfo?.licenseStatus === "active";
  const isPending = paymentInfo?.status === "pending";
  const isRejected = paymentInfo?.status === "rejected";
  
  const upiId = paymentInfo?.upiId || "rakesh837m@okaxis";
  const qrCodeUrl = paymentInfo?.qrCodeUrl || "/qr-code.png";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(upiId);
      setIsCopied(true);
      toast({ title: "Copied!", description: "UPI ID copied to clipboard." });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast({ title: "Error", description: "Failed to copy UPI ID.", variant: "destructive" });
    }
  };

  const handleDownloadQr = async () => {
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "aria_ai_qr_code.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      toast({ title: "Error", description: "Failed to download QR code.", variant: "destructive" });
    }
  };

  const handleShareQr = async () => {
    try {
      if (navigator.share) {
        const response = await fetch(qrCodeUrl);
        const blob = await response.blob();
        const file = new File([blob], "qr_code.png", { type: blob.type });
        await navigator.share({
          title: "Payment QR Code",
          text: "Scan this QR code to make the payment.",
          files: [file]
        });
      } else {
        toast({ title: "Not Supported", description: "Web Share API not supported in this browser." });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
         toast({ title: "Error", description: "Failed to share QR code.", variant: "destructive" });
      }
    }
  };

  if (isAdmin || hasActiveLicense) {
    return <Deployment projectId={projectId} />;
  }

  if (isCheckingPayment) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }
  
  if (isPending) {
    return (
      <div className="mt-8 flex items-center justify-center">
        <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl p-8 space-y-6 text-center shadow-lg shadow-violet-500/10">
          <div className="mx-auto w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
          </div>
          <h3 className="text-2xl font-bold text-foreground">Pending Verification</h3>
          <p className="text-muted-foreground text-sm">
            Your payment is currently being verified by an admin. Once approved, deployment will be permanently unlocked for this project.
          </p>
          <div className="p-4 bg-muted rounded-xl text-sm font-medium border border-border">
            <p className="text-muted-foreground">Urgent? Contact Admin:</p>
            <p className="text-foreground text-lg mt-1 font-bold tracking-wider">9787191443</p>
          </div>
        </div>
      </div>
    );
  }

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!utr.trim()) {
      toast({ title: "UTR Required", description: "Please enter the UTR or Transaction ID.", variant: "destructive" });
      return;
    }
    if (!screenshotFile) {
      toast({ title: "Screenshot Required", description: "Please upload the payment screenshot.", variant: "destructive" });
      return;
    }

    setIsPaying(true);
    try {
      // 1. Upload screenshot to Supabase
      const fileExt = screenshotFile.name.split('.').pop();
      const fileName = `payment_proof_${projectId}_${Date.now()}.${fileExt}`;
      const filePath = `payments/${fileName}`;

      const formData = new FormData();
      formData.append("file", screenshotFile);
      formData.append("storagePath", filePath);

      const token = session?.access_token;
      const uploadRes = await fetch(apiUrl("/api/files/upload-public"), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to upload screenshot");
      }

      const uploadData = await uploadRes.json();
      const screenshotUrl = uploadData.publicUrl;

      // 2. Submit payment record
      const res = await authFetch(apiUrl("/api/payments/manual"), {
        method: "POST",
        body: JSON.stringify({
          projectId,
          utrTransactionId: utr,
          method,
          screenshotUrl,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit payment");
      }

      toast({ title: "Payment Submitted", description: "Your payment is now pending verification." });
      queryClient.invalidateQueries({ queryKey: ["payment-status", projectId] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to submit payment.", variant: "destructive" });
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="mt-8 flex items-center justify-center">
      <div className="relative w-full max-w-4xl grid md:grid-cols-2 gap-8">
        
        {/* Left Side: Info & QR Code */}
        <div className="relative bg-card border border-border rounded-2xl p-8 space-y-6 flex flex-col justify-center items-center shadow-lg">
          <div className="absolute -inset-1 bg-gradient-to-br from-violet-600/20 via-indigo-600/20 to-transparent rounded-2xl blur-lg -z-10" />
          
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-foreground">Deploy to Your Website</h3>
            <p className="text-muted-foreground text-sm max-w-[280px] mx-auto">
              Each project requires a one-time lifetime license fee of ₹499. No recurring charges.
            </p>
          </div>

          <div className="text-center py-2">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-indigo-500">₹499</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 uppercase font-semibold tracking-wider">Lifetime License</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-zinc-200 inline-block relative group">
            <img src={qrCodeUrl} alt="Payment QR Code" className="w-48 h-48 object-contain" onError={(e) => { (e.target as HTMLImageElement).src = 'https://upload.wikimedia.org/wikipedia/commons/d/d0/QR_code_for_mobile_English_Wikipedia.svg' }} />
          </div>
          
          <div className="flex gap-2 justify-center w-full max-w-[240px]">
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs h-8" onClick={handleDownloadQr}>
              <Download className="w-3.5 h-3.5" /> Download
            </Button>
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs h-8" onClick={handleShareQr}>
              <Share2 className="w-3.5 h-3.5" /> Share
            </Button>
          </div>
          
          <div className="text-center bg-muted/50 w-full py-3 rounded-lg border border-border mt-2">
            <p className="text-xs text-muted-foreground mb-1">Scan to pay or use UPI ID</p>
            <div className="flex items-center justify-center gap-2">
              <p className="font-mono font-bold text-foreground tracking-wide">{upiId}</p>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={handleCopy}>
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="relative bg-card border border-border rounded-2xl p-8 space-y-6 shadow-lg shadow-violet-500/5">
          <div className="space-y-1">
            <h3 className="text-xl font-bold">Confirm Payment</h3>
            <p className="text-sm text-muted-foreground">Submit your transaction details below.</p>
            {isRejected && (
              <p className="text-sm font-medium text-destructive mt-2 bg-destructive/10 p-2 rounded-md">
                Your previous submission was rejected. Please try again or contact admin.
              </p>
            )}
          </div>

          <form onSubmit={handlePaymentSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Name</label>
                <Input value={dbUser?.name || ''} disabled className="bg-muted/50" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Email</label>
                <Input value={dbUser?.email || ''} disabled className="bg-muted/50" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Amount Paid</label>
              <Input value="₹499 (One-Time)" disabled className="bg-muted/50 font-bold text-violet-500" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Payment Method</label>
              <select 
                className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="Google Pay">Google Pay</option>
                <option value="PhonePe">PhonePe</option>
                <option value="Paytm">Paytm</option>
                <option value="BHIM">BHIM</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1 uppercase">
                UTR / Transaction ID <span className="text-destructive">*</span>
              </label>
              <Input 
                required 
                placeholder="e.g. 312345678901" 
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1 uppercase">
                Payment Screenshot <span className="text-destructive">*</span>
              </label>
              <Input 
                type="file" 
                accept="image/*" 
                required
                onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
                className="cursor-pointer file:cursor-pointer file:bg-violet-500 file:text-white file:border-0 file:rounded-md file:px-3 file:py-1 file:mr-3 hover:file:bg-violet-600 file:transition-colors"
              />
            </div>

            <Button
              type="submit"
              disabled={isPaying}
              className="w-full mt-6 py-6 text-base rounded-xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/25 flex items-center justify-center gap-2"
            >
              {isPaying ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</>
              ) : (
                <><CheckCircle2 className="w-5 h-5" /> I Have Completed Payment</>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
