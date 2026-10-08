import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { CardSkeleton } from "@/components/ui/skeletons";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Copy,
  Pencil,
  Trash2,
  Loader2,
  Search,
  MoreVertical,
  ExternalLink,
  PowerOff,
  Power,
  Sparkles,
  ArrowRight,
  Globe,
  Laptop,
  CheckCircle2,
  Activity,
  Layers,
  LayoutDashboard,
  ShieldCheck,
  Compass,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { getProjectsFilterState, saveProjectsFilterState } from "@/lib/workspace-continuity";

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
  tags?: string[];
  knowledgeCount?: number;
  createdAt: string;
  updatedAt: string;
};

const ITEMS_PER_PAGE = 10;

export default function ProjectsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isExploreOpen, setIsExploreOpen] = useState(false);

  const savedFilters = getProjectsFilterState();
  const [searchQuery, setSearchQuery] = useState(savedFilters.searchQuery);
  const [sortBy, setSortBy] = useState(savedFilters.sortBy);
  const [currentPage, setCurrentPage] = useState(savedFilters.currentPage);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    saveProjectsFilterState({ searchQuery: query, sortBy, currentPage: 1 });
  };

  const handleSortChange = (sort: string) => {
    setSortBy(sort);
    saveProjectsFilterState({ searchQuery, sortBy: sort, currentPage });
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    saveProjectsFilterState({ searchQuery, sortBy, currentPage: page });
  };

  const authFetch = useAuthFetch();
  const { session, dbUser, activeOrganizationId } = useAuth();

  const isUnrestricted = dbUser?.role === "super_admin";
  const canCreate = dbUser?.features?.canCreateProject !== false || isUnrestricted;

  const { data: projectList, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["projects", activeOrganizationId, dbUser?.id],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/projects"));
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || `Server responded with status ${res.status}`);
      }
      return res.json() as Promise<Project[]>;
    },
    enabled: !!session,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    staleTime: 30000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete project");
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["projects"] });
      const previous = queryClient.getQueryData<Project[]>(["projects"]);
      if (previous) {
        queryClient.setQueryData<Project[]>(["projects"], old => old?.filter(p => p.id !== id));
      }
      return { previous };
    },
    onError: (err, id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["projects"], context.previous);
      }
      toast({ title: "Failed to delete project", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
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
      await queryClient.cancelQueries({ queryKey: ["projects"] });
      const previous = queryClient.getQueryData<Project[]>(["projects"]);
      if (previous) {
        queryClient.setQueryData<Project[]>(["projects"], old => old?.map(p => p.id === id ? { ...p, isActive } : p));
      }
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["projects"], context.previous);
      }
      toast({ title: "Failed to update project", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
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
      const matchesUrl = p.websiteUrl?.toLowerCase().includes(q) ?? false;
      return matchesName || matchesDesc || matchesPrompt || matchesUrl;
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

  // Helper to determine real setup % and environment status
  const getProjectState = (project: Project) => {
    const isLiveUrl = !!project.websiteUrl && !project.websiteUrl.includes("localhost") && !project.websiteUrl.includes("127.0.0.1");
    const isLive = isLiveUrl && (project.isActive || project.status === "active" || project.status === "live");

    // Calculate real setup progress
    let percent = 25; // Base project creation
    if (project.websiteUrl) percent += 25;
    if ((project.knowledgeCount || 0) > 0) percent += 25;
    if (project.isActive || isLive) percent += 25;

    return {
      isLive,
      isLiveUrl,
      displayUrl: project.websiteUrl || "http://localhost:3000",
      setupPercent: percent,
    };
  };

  return (
    <>
      <div className="max-w-6xl mx-auto px-6 py-10 text-foreground">
        
        {/* Loading State */}
        {isLoading ? (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div className="h-10 w-48 bg-card/60 animate-pulse rounded-xl" />
              <div className="h-10 w-32 bg-card/60 animate-pulse rounded-xl" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center border border-dashed border-red-500/20 rounded-3xl bg-red-500/5">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <p className="text-foreground font-semibold mb-1">Failed to load projects</p>
              <p className="text-muted-foreground text-sm max-w-sm">
                {(error as Error)?.message || "Could not connect to the server."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-2"
            >
              <Loader2 className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              Retry
            </Button>
          </div>
        ) : !projectList || projectList.length === 0 ? (

          /* ============================================================ */
          /* 2. NEW DEFAULT LANDING SCREEN — ZERO PROJECTS (FIRST-TIME)   */
          /* ============================================================ */
          <div className="flex flex-col items-center justify-center min-h-[70vh] text-center max-w-3xl mx-auto py-12 px-4 space-y-12">
            
            {/* Header Hero */}
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
              <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-xs font-semibold px-4 py-1.5 rounded-full shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>✨ Welcome to NOVA AI</span>
              </div>

              <h1 className="text-4xl md:text-6xl font-extrabold text-foreground tracking-tight leading-[1.15]">
                Build. Understand. Launch.
              </h1>

              <p className="text-xl md:text-2xl text-muted-foreground max-w-xl mx-auto font-normal leading-relaxed">
                Turn your business website into an intelligent AI assistant.
              </p>

              <div className="pt-4">
                <Button
                  size="lg"
                  onClick={() => setLocation("/projects/new")}
                  disabled={!canCreate}
                  className="h-14 px-10 text-lg font-bold bg-gradient-to-r from-primary via-indigo-600 to-purple-600 hover:from-primary/90 hover:to-purple-500 text-primary-foreground border-0 shadow-[0_0_40px_-5px_rgba(99,102,241,0.5)] rounded-2xl gap-3 transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
                >
                  <Plus className="w-6 h-6" />
                  + Create Your First Project
                </Button>
              </div>
            </div>

            {/* Simple Visual Journey Flow */}
            <div className="w-full pt-8 border-t border-border/60">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-8">
                Visual Journey
              </p>

              <div className="flex flex-col md:flex-row items-center justify-between gap-4 max-w-4xl mx-auto">
                
                <div className="flex flex-col items-center p-5 rounded-2xl bg-card border border-border shadow-sm flex-1 w-full text-center group hover:border-primary/50 transition-all">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Globe className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-foreground">Website</h4>
                  <p className="text-xs text-muted-foreground mt-1">Live URL or Localhost</p>
                </div>

                <div className="text-muted-foreground md:rotate-0 rotate-90">
                  <ArrowRight className="w-5 h-5 text-primary/70" />
                </div>

                <div className="flex flex-col items-center p-5 rounded-2xl bg-card border border-border shadow-sm flex-1 w-full text-center group hover:border-primary/50 transition-all">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Activity className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-foreground">AI understands</h4>
                  <p className="text-xs text-muted-foreground mt-1">Automatic Business Discovery</p>
                </div>

                <div className="text-muted-foreground md:rotate-0 rotate-90">
                  <ArrowRight className="w-5 h-5 text-primary/70" />
                </div>

                <div className="flex flex-col items-center p-5 rounded-2xl bg-card border border-border shadow-sm flex-1 w-full text-center group hover:border-primary/50 transition-all">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-foreground">Knowledge + AI Assistant</h4>
                  <p className="text-xs text-muted-foreground mt-1">RAG & Business Context</p>
                </div>

                <div className="text-muted-foreground md:rotate-0 rotate-90">
                  <ArrowRight className="w-5 h-5 text-primary/70" />
                </div>

                <div className="flex flex-col items-center p-5 rounded-2xl bg-card border border-border shadow-sm flex-1 w-full text-center group hover:border-primary/50 transition-all">
                  <div className="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Copy className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-foreground">Install</h4>
                  <p className="text-xs text-muted-foreground mt-1">Copy Script Snippet</p>
                </div>

                <div className="text-muted-foreground md:rotate-0 rotate-90">
                  <ArrowRight className="w-5 h-5 text-primary/70" />
                </div>

                <div className="flex flex-col items-center p-5 rounded-2xl bg-card border border-border shadow-sm flex-1 w-full text-center group hover:border-primary/50 transition-all">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-foreground">Launch</h4>
                  <p className="text-xs text-muted-foreground mt-1">Live Business Assistant</p>
                </div>

              </div>
            </div>

          </div>

        ) : (

          /* ============================================================ */
          /* 3. EXISTING USER — USEFUL PROJECT HOME                       */
          /* ============================================================ */
          <div className="space-y-8 animate-in fade-in duration-300">
            
            {/* Greeting Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-border">
              <div>
                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
                  Good morning 👋
                </h1>
                <p className="text-muted-foreground text-lg mt-1 font-medium">
                  Welcome back to NOVA AI
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setIsExploreOpen(true)}
                  className="border-primary/30 hover:border-primary/60 bg-primary/5 hover:bg-primary/10 text-primary gap-2 h-12 px-5 rounded-2xl font-semibold shadow-xs"
                >
                  <Sparkles className="w-4 h-4 text-primary" />
                  ✨ Explore Demo
                </Button>
                <Button
                  onClick={() => setLocation("/projects/new")}
                  disabled={!canCreate}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-12 px-6 rounded-2xl gap-2 shadow-lg"
                >
                  <Plus className="w-5 h-5" />
                  + New Project
                </Button>
              </div>
            </div>

            {/* Toolbar: Search & Sort */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  placeholder="Search projects by name, URL..."
                  className="pl-11 h-12 rounded-2xl bg-card border-border text-foreground transition-all duration-300"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
              </div>
              <div className="w-full sm:w-[220px]">
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger className="h-12 rounded-2xl bg-card border-border text-foreground">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border text-popover-foreground rounded-2xl shadow-xl">
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="alpha">Alphabetical</SelectItem>
                    <SelectItem value="updated">Recently Updated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Projects Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {paginatedProjects.map((project) => {
                const state = getProjectState(project);
                return (
                  <div
                    key={project.id}
                    className="group flex flex-col justify-between rounded-3xl bg-card border border-border hover:border-primary/40 shadow-xs hover:shadow-xl transition-all duration-300 p-7 relative overflow-hidden"
                  >
                    <div className="space-y-4 relative z-10">
                      
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {state.isLive ? (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold px-3 py-1 gap-1.5 rounded-full">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                              ● Live
                            </Badge>
                          ) : (
                            <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/30 font-bold px-3 py-1 gap-1.5 rounded-full">
                              <Laptop className="w-3.5 h-3.5" />
                              ● Local Development
                            </Badge>
                          )}

                          {state.isLive && (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 font-semibold px-2.5 py-0.5 text-xs">
                              AI Ready
                            </Badge>
                          )}
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-foreground/10">
                              <MoreVertical className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 bg-popover border border-border text-popover-foreground rounded-2xl shadow-xl">
                            <DropdownMenuItem className="rounded-xl my-0.5 cursor-pointer" onClick={() => setLocation(`/projects/${project.id}/edit`)}>
                              <Pencil className="w-4 h-4 mr-2" /> Edit Project
                            </DropdownMenuItem>
                            <DropdownMenuItem className="rounded-xl my-0.5 cursor-pointer" onClick={() => copyShareLink(project.shareToken)}>
                              <Copy className="w-4 h-4 mr-2" /> Copy Preview Link
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="rounded-xl my-0.5 cursor-pointer"
                              onClick={() => toggleMutation.mutate({ id: project.id, isActive: !project.isActive })}
                            >
                              {project.isActive ? (
                                <><PowerOff className="w-4 h-4 mr-2 text-muted-foreground" /> Deactivate</>
                              ) : (
                                <><Power className="w-4 h-4 mr-2 text-emerald-400" /> Activate</>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-400 hover:bg-red-500/10 rounded-xl my-0.5 cursor-pointer"
                              onClick={() => setDeletingId(project.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Title & URL */}
                      <div>
                        <h3 className="text-2xl font-bold text-foreground tracking-tight truncate group-hover:text-primary transition-colors">
                          {project.name}
                        </h3>
                        <p className="text-xs font-mono text-muted-foreground mt-1 truncate">
                          {state.displayUrl}
                        </p>
                      </div>

                      {/* Description or Knowledge Sources */}
                      <p className="text-muted-foreground text-sm line-clamp-2 leading-relaxed">
                        {project.description || project.systemPrompt}
                      </p>
                    </div>

                    {/* Footer / CTA */}
                    <div className="pt-6 mt-6 border-t border-border/60 flex items-center justify-between gap-4 relative z-10">
                      {!state.isLive && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-medium">Progress:</span>
                          <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">
                            Setup {state.setupPercent}%
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 ml-auto">
                        {state.isLive ? (
                          <Button
                            onClick={() => setLocation(`/projects/${project.id}/edit`)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-2xl gap-2 h-10 px-6 shadow-md"
                          >
                            Open Project <ArrowRight className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            onClick={() => setLocation(`/projects/${project.id}/edit`)}
                            variant="outline"
                            className="border-primary/40 text-primary hover:bg-primary/10 font-bold rounded-2xl gap-2 h-10 px-6"
                          >
                            Continue <ArrowRight className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedProjects.length)} of {filteredAndSortedProjects.length} projects
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    className="rounded-xl"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    className="rounded-xl"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}

          </div>
        )}

      </div>

      {/* Delete Dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent className="bg-card border border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete project?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete this project and all associated configurations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0"
              onClick={() => {
                if (deletingId) deleteMutation.mutate(deletingId);
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Interactive Demo Dialog */}
      <Dialog open={isExploreOpen} onOpenChange={setIsExploreOpen}>
        <DialogContent className="max-w-2xl bg-card border border-border text-foreground p-8 rounded-3xl shadow-2xl">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-2xl font-bold tracking-tight">
              Explore NOVA Business AI
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              See what a complete NOVA project looks like before connecting your own website.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 p-5 rounded-2xl bg-foreground/[0.02] border border-border space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="font-bold text-lg">Apex Dynamics — Demo</span>
                <p className="text-xs text-muted-foreground">Enterprise Business Consulting</p>
              </div>
              <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs">
                🧪 Demo Mode
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Explore business intelligence, RAG knowledge sources, live widget customization, and agent control in a safe sandbox.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button variant="ghost" onClick={() => setIsExploreOpen(false)}>Close</Button>
            <Button
              onClick={() => {
                setIsExploreOpen(false);
                setLocation("/projects/00000000-0000-4000-8000-000000000000/edit");
              }}
              className="bg-primary text-primary-foreground font-semibold gap-2"
            >
              Open Demo Project <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
