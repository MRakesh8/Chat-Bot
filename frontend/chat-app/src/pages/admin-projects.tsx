import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Copy,
  Pencil,
  Trash2,
  Globe,
  Loader2,
  FolderOpen,
  Search,
  MoreVertical,
  ExternalLink,
  PowerOff,
  Power,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  tags: string[];
  knowledgeCount?: number;
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

const ITEMS_PER_PAGE = 10;

export default function AdminProjectsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [currentPage, setCurrentPage] = useState(1);
  
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

  const filteredAndSortedProjects = useMemo(() => {
    if (!projectList) return [];
    
    let filtered = projectList.filter(p => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const matchesName = p.name.toLowerCase().includes(q);
      const matchesDesc = p.description?.toLowerCase().includes(q) ?? false;
      const matchesPrompt = p.systemPrompt.toLowerCase().includes(q);
      const matchesTags = p.tags?.some(t => t.toLowerCase().includes(q)) ?? false;
      return matchesName || matchesDesc || matchesPrompt || matchesTags;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "alpha":
          return a.name.localeCompare(b.name);
        case "updated":
          return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [projectList, searchQuery, sortBy]);

  const totalPages = Math.ceil(filteredAndSortedProjects.length / ITEMS_PER_PAGE);
  const paginatedProjects = filteredAndSortedProjects.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <>
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div className="flex items-start gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/chat")}
              className="text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-full mt-1 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-foreground/70 tracking-tight">Projects</h1>
              <div className="text-sm text-muted-foreground mt-2 flex gap-3 font-medium">
                <span className="bg-foreground/5 px-3 py-1 rounded-full border border-foreground/10">Total: {projectList?.length || 0}</span>
                <span className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20">
                  Active: {projectList?.filter(p => p.isActive).length || 0}
                  <span className="relative flex h-2 w-2 ml-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                </span>
              </div>
            </div>
          </div>
          <Button
            onClick={() => setLocation("/admin/projects/new")}
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary shadow-[0_0_20px_rgba(var(--primary),0.3)] text-primary-foreground border-0 gap-2 shrink-0 h-11 px-6 rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] font-medium"
          >
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </div>

        {/* Toolbar: Search & Sort */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input 
              placeholder="Search projects by name, description, tags..." 
              className="pl-11 h-11 rounded-xl bg-foreground/[0.02] border-foreground/10 focus:bg-foreground/[0.05] focus:border-primary/50 text-foreground transition-all duration-300"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="w-full sm:w-[220px]">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-11 rounded-xl bg-foreground/[0.02] border-foreground/10 focus:ring-primary/50 text-foreground">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent className="bg-[#121214]/95 backdrop-blur-xl border-foreground/10 rounded-xl">
                <SelectItem value="newest" className="rounded-lg my-0.5 hover:bg-foreground/10">Newest First</SelectItem>
                <SelectItem value="oldest" className="rounded-lg my-0.5 hover:bg-foreground/10">Oldest First</SelectItem>
                <SelectItem value="alpha" className="rounded-lg my-0.5 hover:bg-foreground/10">Alphabetical</SelectItem>
                <SelectItem value="updated" className="rounded-lg my-0.5 hover:bg-foreground/10">Most Recently Updated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : !projectList?.length ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center border border-dashed border-border rounded-xl bg-card/30">
            <div className="w-16 h-16 rounded-2xl bg-card/40 border border-foreground/5 backdrop-blur-sm flex items-center justify-center shadow-sm">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-foreground font-medium mb-1">📁 No Projects Yet</p>
              <p className="text-muted-foreground text-sm">
                Create your first AI assistant.
              </p>
            </div>
            <Button
              onClick={() => setLocation("/admin/projects/new")}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-primary-foreground border-0 gap-2 mt-2"
            >
              <Plus className="w-4 h-4" />
              Create Project
            </Button>
          </div>
        ) : filteredAndSortedProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-border rounded-xl bg-card/30">
            <Search className="w-8 h-8 text-muted-foreground mb-4 opacity-50" />
            <p className="text-foreground font-medium mb-1">No projects found</p>
            <p className="text-muted-foreground text-sm">
              No projects match your search query.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {paginatedProjects.map((project) => (
              <div
                key={project.id}
                className="group flex flex-col md:flex-row md:items-center rounded-3xl bg-foreground/[0.02] border border-foreground/[0.05] backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.2)] p-6 hover:bg-foreground/[0.04] hover:border-foreground/[0.1] hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-300 gap-5 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                
                {/* Left: Info */}
                <div className="flex-1 min-w-0 relative z-10">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-foreground font-bold text-xl truncate tracking-tight" title={project.name}>{project.name}</h3>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${project.isActive ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-foreground/5 border-foreground/10 text-muted-foreground"} shrink-0`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${project.isActive ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        {project.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  
                  <p className="text-foreground/70 text-sm line-clamp-2 mb-4 leading-relaxed">
                    {project.description || project.systemPrompt}
                  </p>
                  
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-muted-foreground/80">
                    <span title="Created Date" className="flex items-center gap-1">
                      Created {new Date(project.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-foreground/20"></span>
                    <span title="Knowledge Sources" className="flex items-center gap-1">
                      {project.knowledgeCount || 0} Knowledge Sources
                    </span>
                    {project.updatedAt && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-foreground/20"></span>
                        <span title="Last Updated" className="flex items-center gap-1">
                          Updated {new Date(project.updatedAt).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 md:shrink-0 mt-2 md:mt-0 pt-4 md:pt-0 border-t md:border-0 border-foreground/5 relative z-10">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-2 rounded-xl border-foreground/10 bg-foreground/5 hover:bg-foreground/10 hover:text-foreground transition-all"
                    onClick={() => setLocation(`/admin/projects/${project.id}/edit`)}
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Open
                  </Button>
                  
                  <Button
                    size="sm"
                    className="h-9 gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground border-0 shadow-lg"
                    onClick={() => window.open(`${basePath}/p/${project.shareToken}`, "_blank")}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Preview
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 ml-1 rounded-xl hover:bg-foreground/10">
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-[#121214]/95 backdrop-blur-xl border-foreground/10 rounded-xl">
                      <DropdownMenuItem className="rounded-lg my-0.5 hover:bg-foreground/10" onClick={() => setLocation(`/admin/projects/${project.id}/edit`)}>
                        <Pencil className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="rounded-lg my-0.5 hover:bg-foreground/10" onClick={() => copyShareLink(project.shareToken)}>
                        <Copy className="w-4 h-4 mr-2" /> Copy Link
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-foreground/10" />
                      <DropdownMenuItem 
                        className="rounded-lg my-0.5 hover:bg-foreground/10"
                        onClick={() => toggleMutation.mutate({ id: project.id, isActive: !project.isActive })}
                      >
                        {project.isActive ? (
                          <><PowerOff className="w-4 h-4 mr-2 text-muted-foreground" /> Deactivate</>
                        ) : (
                          <><Power className="w-4 h-4 mr-2 text-emerald-400" /> Activate</>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-foreground/10" />
                      
                      <DropdownMenuItem 
                        className="text-red-400 hover:bg-red-500/10 hover:text-red-300 focus:bg-red-500/10 focus:text-red-300 rounded-lg my-0.5"
                        onClick={() => setDeletingId(project.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedProjects.length)} of {filteredAndSortedProjects.length} projects
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Shared Delete Dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent className="bg-card border border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete project?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete this project and all its conversations. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0"
              onClick={() => {
                if (deletingId) deleteMutation.mutate(deletingId);
              }}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
