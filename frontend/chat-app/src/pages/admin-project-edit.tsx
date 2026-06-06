import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Save, Copy, Globe, MessageSquare, Database, LayoutDashboard, Settings, FileText } from "lucide-react";
import { KnowledgeBase } from "../components/project/knowledge-base";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "../components/layout/dashboard-layout";
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

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [savedToken, setSavedToken] = useState<string | null>(null);

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
    mutationFn: async (data: { name: string; description: string; systemPrompt: string }) => {
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
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/admin/projects")}
            className="text-zinc-400 hover:text-white border border-white/10 hover:bg-white/5"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {isNew ? "New Project" : "Edit Project"}
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
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
            <TabsList className="mb-6 bg-white/5 border border-white/10 p-1 w-full flex overflow-x-auto justify-start h-12">
              <TabsTrigger value="overview" className="flex-1 min-w-[120px] data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <LayoutDashboard className="w-4 h-4 mr-2" /> Overview
              </TabsTrigger>
              <TabsTrigger value="chat" className="flex-1 min-w-[120px] data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <MessageSquare className="w-4 h-4 mr-2" /> Test Chat
              </TabsTrigger>
              <TabsTrigger value="knowledge" className="flex-1 min-w-[140px] data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <Database className="w-4 h-4 mr-2" /> Knowledge Base
              </TabsTrigger>
              <TabsTrigger value="reports" className="flex-1 min-w-[120px] data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <FileText className="w-4 h-4 mr-2" /> Reports
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex-1 min-w-[120px] data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <Settings className="w-4 h-4 mr-2" /> Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              {isNew ? (
                <div className="text-center py-12 bg-black/20 border border-white/10 rounded-xl mt-8">
                  <LayoutDashboard className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">Create Project First</h3>
                  <p className="text-zinc-400 max-w-md mx-auto">You need to save the project settings before you can view the overview.</p>
                </div>
              ) : (
                <Card className="bg-white/5 border-white/10 text-white mt-8">
                <CardHeader>
                  <CardTitle>Project Overview</CardTitle>
                  <CardDescription className="text-zinc-400">
                    Quick stats and access to your project.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-black/20 border border-white/10 rounded-lg p-4">
                      <h3 className="text-zinc-400 text-sm font-medium mb-1">Status</h3>
                      <p className="text-xl font-semibold text-white flex items-center gap-2">
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
                        <code className="flex-1 text-xs text-zinc-300 bg-black/30 rounded-lg px-3 py-2 font-mono truncate border border-white/5">
                          {shareUrl}
                        </code>
                        <Button type="button" size="sm" variant="outline" onClick={copyShareLink} className="border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white shrink-0 gap-1.5">
                          <Copy className="w-3 h-3" /> Copy
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => window.open(shareUrl, "_blank")} className="border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white shrink-0 gap-1.5">
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
                <div className="text-center py-12 bg-black/20 border border-white/10 rounded-xl mt-8">
                  <MessageSquare className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">Create Project First</h3>
                  <p className="text-zinc-400 max-w-md mx-auto">You need to save the project settings before you can test the chat.</p>
                </div>
              ) : (
                <Card className="bg-white/5 border-white/10 text-white mt-8 overflow-hidden h-[600px] flex flex-col">
                <CardHeader className="pb-2 shrink-0">
                  <CardTitle>Test Chatbot</CardTitle>
                  <CardDescription className="text-zinc-400">
                    Interact with the AI using your project's knowledge base.
                  </CardDescription>
                </CardHeader>
                <div className="flex-1 relative bg-black/30 w-full overflow-hidden">
                   {shareUrl ? (
                     <iframe src={shareUrl} className="w-full h-full border-0 absolute inset-0" title="Test Chatbot" />
                   ) : (
                     <div className="flex h-full items-center justify-center text-zinc-500">Share link not available</div>
                   )}
                </div>
              </Card>
              )}
            </TabsContent>

            <TabsContent value="knowledge">
              {isNew ? (
                <div className="text-center py-12 bg-black/20 border border-white/10 rounded-xl mt-8">
                  <Database className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">Create Project First</h3>
                  <p className="text-zinc-400 max-w-md mx-auto">You need to save the project settings before you can upload knowledge base documents (PDF, PPT, Text, etc).</p>
                </div>
              ) : (
                <KnowledgeBase projectId={projectId!} />
              )}
            </TabsContent>

            <TabsContent value="reports">
              {isNew ? (
                <div className="text-center py-12 bg-black/20 border border-white/10 rounded-xl mt-8">
                  <FileText className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">Create Project First</h3>
                  <p className="text-zinc-400 max-w-md mx-auto">You need to save the project settings before you can view reports.</p>
                </div>
              ) : (
                <Card className="bg-white/5 border-white/10 text-white mt-8">
                <CardHeader>
                  <CardTitle>Project Reports</CardTitle>
                  <CardDescription className="text-zinc-400">
                    Generate an AI summary report based on all project knowledge.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Button
                    onClick={generateReport}
                    disabled={isGenerating || projectId === "new" || !projectId}
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0 gap-2 px-6"
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    {isGenerating ? "Generating Report..." : "Generate Project Summary"}
                  </Button>

                  <div className="mt-8 space-y-4">
                    <h3 className="text-sm font-medium text-zinc-300 border-b border-white/10 pb-2">Past Reports</h3>
                    {reports && reports.length > 0 ? (
                      <div className="space-y-2">
                        {reports.map((report) => (
                          <div key={report.id} className="flex items-center justify-between bg-black/20 border border-white/10 p-3 rounded-lg">
                            <div>
                              <p className="text-sm font-medium text-white">{report.title}</p>
                              <p className="text-xs text-zinc-500">{new Date(report.createdAt).toLocaleString()}</p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-white/10 bg-white/5 hover:bg-white/10 text-white"
                              onClick={() => window.open(report.contentUrl, "_blank")}
                            >
                              Download PDF
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-black/20 border border-white/10 rounded-lg">
                        <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                        <p className="text-zinc-400 text-sm">No reports generated yet.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              )}
            </TabsContent>

            <TabsContent value="settings">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Project Name *</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Customer Support Bot, Sales Assistant"
                    className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:border-primary focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">
                    Description <span className="text-zinc-600 font-normal">(optional)</span>
                  </label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this chatbot for?"
                    className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:border-primary focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Knowledge &amp; Instructions *</label>
                  <p className="text-xs text-zinc-500">
                    Write everything the AI should know — your product info, FAQs, rules, tone of voice,
                    or any specific information. The AI will use only this to answer questions.
                  </p>
                  <Textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Example:\nYou are a helpful support assistant for Acme Corp.\n..."
                    className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:border-primary focus:ring-primary/20 min-h-[320px] font-mono text-sm resize-y"
                  />
                  <p className="text-xs text-zinc-600">{systemPrompt.length.toLocaleString()} characters</p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0 gap-2 px-6"
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
                    <p className="text-green-400 font-medium text-sm mb-2">
                      {savedToken ? "🎉 Project created! Share this link:" : "Share link"}
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-zinc-300 bg-black/30 rounded-lg px-3 py-2 font-mono truncate border border-white/5">
                        {shareUrl}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={copyShareLink}
                        className="border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white shrink-0 gap-1.5"
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(shareUrl, "_blank")}
                        className="border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white shrink-0 gap-1.5"
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
    </DashboardLayout>
  );
}
