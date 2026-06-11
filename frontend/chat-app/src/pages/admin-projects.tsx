import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
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

export default function AdminProjectsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const authFetch = useAuthFetch();

  const { data: projectList, isLoading } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/projects"));
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json() as Promise<Project[]>;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete project");
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["admin-projects"] });
      const previous = queryClient.getQueryData<Project[]>(["admin-projects"]);
      if (previous) {
        queryClient.setQueryData<Project[]>(["admin-projects"], old => old?.filter(p => p.id !== id));
      }
      return { previous };
    },
    onError: (err, id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["admin-projects"], context.previous);
      }
      toast({ title: "Failed to delete project", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
    },
    onSuccess: () => {
      toast({ title: "Project deleted" });
      setDeletingId(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await authFetch(apiUrl(`/api/projects/${id}`), {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to update project");
      return res.json() as Promise<Project>;
    },
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: ["admin-projects"] });
      const previous = queryClient.getQueryData<Project[]>(["admin-projects"]);
      if (previous) {
        queryClient.setQueryData<Project[]>(["admin-projects"], old => old?.map(p => p.id === id ? { ...p, isActive } : p));
      }
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["admin-projects"], context.previous);
      }
      toast({ title: "Failed to update project", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
    },
  });

  const copyShareLink = (token: string) => {
    const url = `${window.location.origin}${basePath}/p/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Share link copied!", description: url });
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/chat")}
              className="text-muted-foreground hover:text-foreground border border-border hover:bg-muted"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Projects</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Create AI assistants with custom knowledge</p>
            </div>
          </div>
          <Button
            onClick={() => setLocation("/admin/projects/new")}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-primary-foreground border-0 gap-2"
          >
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </div>

        {/* Overview Stats */}
        {!isLoading && projectList && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-center">
              <p className="text-muted-foreground text-sm font-medium mb-1">Total Projects</p>
              <p className="text-3xl font-bold text-foreground">{projectList.length}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-center">
              <p className="text-muted-foreground text-sm font-medium mb-1">Active Assistants</p>
              <p className="text-3xl font-bold text-foreground flex items-center gap-2">
                {projectList.filter(p => p.isActive).length}
                <span className="w-2 h-2 rounded-full bg-green-500 ml-2"></span>
              </p>
            </div>
            <div className="bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-indigo-500/30 rounded-2xl p-5 flex flex-col justify-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Globe className="w-16 h-16" />
              </div>
              <p className="text-indigo-200 text-sm font-medium mb-1 relative z-10">System Status</p>
              <p className="text-xl font-bold text-indigo-100 relative z-10">All Systems Operational</p>
            </div>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : !projectList?.length ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-foreground font-medium mb-1">No projects yet</p>
              <p className="text-muted-foreground text-sm">
                Create a project with custom knowledge and share it as a chatbot.
              </p>
            </div>
            <Button
              onClick={() => setLocation("/admin/projects/new")}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-primary-foreground border-0 gap-2 mt-2"
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
                className="group relative bg-card border border-border rounded-2xl p-5 hover:border-foreground/10 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-foreground font-semibold text-base truncate">{project.name}</h3>
                    {project.description && (
                      <p className="text-muted-foreground text-sm mt-0.5 line-clamp-2">{project.description}</p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={`ml-2 shrink-0 text-xs border ${
                      project.isActive
                        ? "border-green-500/30 text-green-600 bg-green-500/10 dark:text-green-400"
                        : "border-border text-muted-foreground bg-muted"
                    }`}
                  >
                    {project.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <p className="text-muted-foreground text-xs line-clamp-2 mb-4 font-mono bg-muted rounded-lg px-3 py-2 border border-border">
                  {project.systemPrompt.slice(0, 120)}
                  {project.systemPrompt.length > 120 ? "…" : ""}
                </p>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground text-xs h-8"
                    onClick={() => copyShareLink(project.shareToken)}
                  >
                    <Copy className="w-3 h-3" />
                    Copy link
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground text-xs h-8"
                    onClick={() => window.open(`${basePath}/p/${project.shareToken}`, "_blank")}
                  >
                    <Globe className="w-3 h-3" />
                    Preview
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground text-xs h-8"
                    onClick={() => setLocation(`/admin/projects/${project.id}/edit`)}
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground text-xs h-8"
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
                    <AlertDialogContent className="bg-card border border-border">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">Delete project?</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                          This will permanently delete <span className="text-foreground font-medium">"{project.name}"</span> and all its conversations. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0"
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
    </DashboardLayout>
  );
}
