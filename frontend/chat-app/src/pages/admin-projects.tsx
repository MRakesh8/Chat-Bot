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
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/chat")}
              className="text-foreground/70 hover:text-foreground border border-white/5 hover:bg-white/5 backdrop-blur-sm"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Projects</h1>
              <div className="text-sm text-muted-foreground mt-0.5 flex gap-3">
                <span>Total Projects: {projectList?.length || 0}</span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  Active Projects: {projectList?.filter(p => p.isActive).length || 0}
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                </span>
              </div>
            </div>
          </div>
          <Button
            onClick={() => setLocation("/admin/projects/new")}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-primary-foreground border-0 gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </div>

        {/* Toolbar: Search & Sort */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search projects by name, description, tags..." 
              className="pl-9 bg-card border-border"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="w-full sm:w-[200px]">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="alpha">Alphabetical</SelectItem>
                <SelectItem value="updated">Most Recently Updated</SelectItem>
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
            <div className="w-16 h-16 rounded-2xl bg-card/40 border border-white/5 backdrop-blur-sm flex items-center justify-center shadow-sm">
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
          <div className="flex flex-col gap-3">
            {paginatedProjects.map((project) => (
              <div
                key={project.id}
                className="group flex flex-col md:flex-row md:items-center bg-card border border-border rounded-xl p-4 hover:border-foreground/20 transition-all gap-4"
              >
                {/* Left: Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1.5">
                    <h3 className="text-foreground font-semibold text-base truncate" title={project.name}>{project.name}</h3>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-muted rounded border border-border/50 shrink-0">
                      <div className={`w-1.5 h-1.5 rounded-full ${project.isActive ? "bg-green-500" : "bg-red-500"}`} />
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${project.isActive ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                        {project.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  
                  <p className="text-muted-foreground text-sm line-clamp-2 mb-3">
                    {project.description || project.systemPrompt}
                  </p>
                  
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <span title="Created Date">
                      Created: {new Date(project.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span>•</span>
                    <span title="Knowledge Sources">
                      Knowledge Sources: {project.knowledgeCount || 0}
                    </span>
                    {project.updatedAt && (
                      <>
                        <span>•</span>
                        <span title="Last Updated">
                          Updated: {new Date(project.updatedAt).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 md:shrink-0 mt-2 md:mt-0 pt-3 md:pt-0 border-t md:border-0 border-border">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => setLocation(`/admin/projects/${project.id}/edit`)}
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Open
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => window.open(`${basePath}/p/${project.shareToken}`, "_blank")}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Preview
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8 ml-1">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setLocation(`/admin/projects/${project.id}/edit`)}>
                        <Pencil className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copyShareLink(project.shareToken)}>
                        <Copy className="w-4 h-4 mr-2" /> Copy Link
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => toggleMutation.mutate({ id: project.id, isActive: !project.isActive })}
                      >
                        {project.isActive ? (
                          <><PowerOff className="w-4 h-4 mr-2" /> Deactivate</>
                        ) : (
                          <><Power className="w-4 h-4 mr-2" /> Activate</>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      
                      {/* Delete using AlertDialog inside Dropdown is tricky, so we trigger a state */}
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
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
