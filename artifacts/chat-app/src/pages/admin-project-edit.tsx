import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Save, Copy, Globe } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type Project = {
  id: number;
  name: string;
  description: string | null;
  systemPrompt: string;
  userId: string;
  shareToken: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

async function fetchProject(id: number): Promise<Project> {
  const res = await fetch(`${basePath}/api/projects/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load project");
  return res.json();
}

async function createProject(data: { name: string; description: string; systemPrompt: string }): Promise<Project> {
  const res = await fetch(`${basePath}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to create project");
  }
  return res.json();
}

async function updateProject(id: number, data: { name: string; description: string; systemPrompt: string }): Promise<Project> {
  const res = await fetch(`${basePath}/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update project");
  return res.json();
}

export default function AdminProjectEditPage() {
  const params = useParams<{ id?: string }>();
  const isNew = !params.id || params.id === "new";
  const projectId = isNew ? null : Number(params.id);

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [savedToken, setSavedToken] = useState<string | null>(null);

  const { data: project, isLoading } = useQuery({
    queryKey: ["admin-project", projectId],
    queryFn: () => fetchProject(projectId!),
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
    mutationFn: createProject,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
      setSavedToken(data.shareToken);
      toast({ title: "Project created!", description: "Your shareable chatbot is ready." });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description: string; systemPrompt: string }) =>
      updateProject(projectId!, data),
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="absolute top-[-10%] left-[-5%] w-[35%] h-[35%] bg-primary/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[35%] h-[35%] bg-blue-500/15 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
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
              {isNew ? "Build a custom AI assistant with your own knowledge" : "Update your project settings and knowledge"}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Project Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Customer Support Bot, Sales Assistant"
                className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:border-primary focus:ring-primary/20"
              />
            </div>

            {/* Description */}
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

            {/* Knowledge */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Knowledge &amp; Instructions *</label>
              <p className="text-xs text-zinc-500">
                Write everything the AI should know — your product info, FAQs, rules, tone of voice, or any specific information. The AI will use this to answer questions.
              </p>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={`Example:\nYou are a helpful support assistant for Acme Corp, a SaaS company.\n\nProduct information:\n- Our pricing starts at $29/month for the Basic plan\n- Enterprise plan includes unlimited users and SSO\n- Free 14-day trial, no credit card required\n\nFAQs:\nQ: How do I reset my password?\nA: Go to Settings > Security > Reset Password\n\nTone: Friendly, professional, concise.`}
                className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus:border-primary focus:ring-primary/20 min-h-[320px] font-mono text-sm resize-y"
              />
              <p className="text-xs text-zinc-600">
                {systemPrompt.length.toLocaleString()} characters
              </p>
            </div>

            {/* Submit */}
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
                {isNew ? "Create Project" : "Save Changes"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLocation("/admin/projects")}
                className="text-zinc-400 hover:text-white"
              >
                Cancel
              </Button>
            </div>

            {/* Share link panel (shown after create or when editing) */}
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
        )}
      </div>
    </div>
  );
}
