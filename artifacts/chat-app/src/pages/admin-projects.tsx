import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Copy,
  Pencil,
  Trash2,
  Globe,
  ToggleLeft,
  ToggleRight,
  Loader2,
  FolderOpen,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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

function useAuthFetch() {
  const { getToken } = useAuth();
  return async (url: string, options: RequestInit = {}) => {
    const token = await getToken();
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

export default function AdminProjectsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const authFetch = useAuthFetch();

  const { data: projectList, isLoading } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: async () => {
      const res = await authFetch(`${basePath}/api/projects`);
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json() as Promise<Project[]>;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${basePath}/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete project");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
      toast({ title: "Project deleted" });
      setDeletingId(null);
    },
    onError: () => toast({ title: "Failed to delete project", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await authFetch(`${basePath}/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to update project");
      return res.json() as Promise<Project>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-projects"] }),
    onError: () => toast({ title: "Failed to update project", variant: "destructive" }),
  });

  const copyShareLink = (token: string) => {
    const url = `${window.location.origin}${basePath}/p/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Share link copied!", description: url });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="absolute top-[-10%] left-[-5%] w-[35%] h-[35%] bg-primary/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[35%] h-[35%] bg-blue-500/15 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/chat")}
              className="text-zinc-400 hover:text-white border border-white/10 hover:bg-white/5"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Projects</h1>
              <p className="text-sm text-zinc-500 mt-0.5">Create AI assistants with custom knowledge</p>
            </div>
          </div>
          <Button
            onClick={() => setLocation("/admin/projects/new")}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0 gap-2"
          >
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : !projectList?.length ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <FolderOpen className="w-8 h-8 text-zinc-500" />
            </div>
            <div>
              <p className="text-white font-medium mb-1">No projects yet</p>
              <p className="text-zinc-500 text-sm">
                Create a project with custom knowledge and share it as a chatbot.
              </p>
            </div>
            <Button
              onClick={() => setLocation("/admin/projects/new")}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0 gap-2 mt-2"
            >
              <Plus className="w-4 h-4" />
              Create your first project
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {projectList.map((project) => (
              <div
                key={project.id}
                className="group relative bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-white/15 hover:bg-white/5 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold text-base truncate">{project.name}</h3>
                    {project.description && (
                      <p className="text-zinc-500 text-sm mt-0.5 line-clamp-2">{project.description}</p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={`ml-2 shrink-0 text-xs border ${
                      project.isActive
                        ? "border-green-500/30 text-green-400 bg-green-500/10"
                        : "border-zinc-600/30 text-zinc-500 bg-zinc-800/50"
                    }`}
                  >
                    {project.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <p className="text-zinc-600 text-xs line-clamp-2 mb-4 font-mono bg-black/30 rounded-lg px-3 py-2 border border-white/5">
                  {project.systemPrompt.slice(0, 120)}
                  {project.systemPrompt.length > 120 ? "…" : ""}
                </p>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs h-8"
                    onClick={() => copyShareLink(project.shareToken)}
                  >
                    <Copy className="w-3 h-3" />
                    Copy link
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs h-8"
                    onClick={() => window.open(`${basePath}/p/${project.shareToken}`, "_blank")}
                  >
                    <Globe className="w-3 h-3" />
                    Preview
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs h-8"
                    onClick={() => setLocation(`/admin/projects/${project.id}/edit`)}
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs h-8"
                    onClick={() => toggleMutation.mutate({ id: project.id, isActive: !project.isActive })}
                    disabled={toggleMutation.isPending}
                  >
                    {project.isActive ? (
                      <ToggleRight className="w-3 h-3 text-green-400" />
                    ) : (
                      <ToggleLeft className="w-3 h-3" />
                    )}
                    {project.isActive ? "Deactivate" : "Activate"}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-red-500/20 bg-red-500/5 hover:bg-red-500/15 text-red-400 hover:text-red-300 text-xs h-8 ml-auto"
                        onClick={() => setDeletingId(project.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[#111118] border border-white/10">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Delete project?</AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400">
                          This will permanently delete <span className="text-white font-medium">"{project.name}"</span> and all its conversations. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-500 text-white border-0"
                          onClick={() => deleteMutation.mutate(project.id)}
                        >
                          {deleteMutation.isPending && deletingId === project.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Delete"
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
