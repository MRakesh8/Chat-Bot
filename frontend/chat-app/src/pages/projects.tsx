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
  ArrowRight,
  Globe,
  Laptop,
  CheckCircle2,
  Activity,
  Sparkles,
  AlertCircle,
  FolderPlus,
  Compass,
  Layers,
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
import { useLocalGreeting } from "@/hooks/use-local-greeting";

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
  const greeting = useLocalGreeting();
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
    onError: (_err, _id, context) => {
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
    onError: (_err, _variables, context) => {
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
      <div className="max-w-6xl mx-auto px-6 py-8 text-foreground space-y-8">
        
        {/* Loading State */}
        {isLoading ? (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div className="h-10 w-48 bg-card animate-pulse rounded-xl" />
              <div className="h-10 w-32 bg-card animate-pulse rounded-xl" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center border border-destructive/20 rounded-2xl bg-destructive/5 p-8">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-destructive" />
            </div>
            <div>
              <p className="text-foreground font-semibold text-lg mb-1">Failed to load projects</p>
              <p className="text-muted-foreground text-sm max-w-sm">
                {(error as Error)?.message || "Could not connect to the server."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 gap-2 rounded-xl"
            >
              <Loader2 className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              Retry
            </Button>
          </div>
        ) : !projectList || projectList.length === 0 ? (

          /* ============================================================ */
          /* ZERO PROJECTS (FIRST-TIME USER LANDING)                     */
          /* ============================================================ */
          <div className="flex flex-col items-center justify-center min-h-[65vh] text-center max-w-3xl mx-auto py-8 px-4 space-y-10">
            
            {/* Hero Header */}
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
              <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-xs font-semibold px-3.5 py-1.5 rounded-full">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Welcome to NOVA Business AI</span>
              </div>

              <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground tracking-tight leading-tight">
                Build. Understand. Launch.
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto font-normal leading-relaxed">
                Turn your business website into an intelligent, autonomous AI assistant in minutes.
              </p>

              <div className="pt-2">
                <Button
                  size="lg"
                  onClick={() => setLocation("/projects/new")}
                  disabled={!canCreate}
                  className="h-12 px-8 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl gap-2.5 shadow-sm transition-all hover:translate-y-[-1px]"
                >
                  <Plus className="w-5 h-5" />
                  Create Your First Project
                </Button>
              </div>
            </div>

            {/* Visual Journey Steps */}
            <div className="w-full pt-6 border-t border-border/70">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 mb-6">
                How NOVA AI Works
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 max-w-4xl mx-auto">
                
                <div className="flex flex-col items-center p-4 rounded-xl bg-card border border-border/80 text-center">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2.5">
                    <Globe className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-xs text-foreground">1. Website URL</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Live or Localhost</p>
                </div>

                <div className="flex flex-col items-center p-4 rounded-xl bg-card border border-border/80 text-center">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2.5">
                    <Activity className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-xs text-foreground">2. Discovery</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Automated Scraping</p>
                </div>

                <div className="flex flex-col items-center p-4 rounded-xl bg-card border border-border/80 text-center">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2.5">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-xs text-foreground">3. Knowledge</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">RAG & Training</p>
                </div>

                <div className="flex flex-col items-center p-4 rounded-xl bg-card border border-border/80 text-center">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2.5">
                    <Copy className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-xs text-foreground">4. Embed Snippet</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">1-Line Script</p>
                </div>

                <div className="flex flex-col items-center p-4 rounded-xl bg-card border border-border/80 text-center sm:col-span-2 md:col-span-1">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-2.5">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <h4 className="font-semibold text-xs text-foreground">5. Launch</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Live Assistant</p>
                </div>

              </div>
            </div>

          </div>

        ) : (

          /* ============================================================ */
          /* EXISTING USER PROJECTS VIEW                                  */
          /* ============================================================ */
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border/80">
              <div>
                <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
                  {greeting}
                </h1>
                <p className="text-muted-foreground text-sm mt-1 font-medium">
                  Manage and monitor your NOVA AI business assistants
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  variant="outline"
                  onClick={() => {
                    const firstProj = projectList?.[0];
                    if (firstProj?.id) {
                      setLocation(`/projects/${firstProj.id}/working`);
                    } else {
                      setLocation("/projects/working");
                    }
                  }}
                  className="border-border hover:bg-accent text-foreground gap-2 h-10 px-4 rounded-xl font-medium text-sm focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Layers className="w-4 h-4 text-primary" />
                  Project Working
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsExploreOpen(true)}
                  className="border-border hover:bg-accent text-foreground gap-2 h-10 px-4 rounded-xl font-medium text-sm focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Compass className="w-4 h-4 text-primary" />
                  Explore Demo
                </Button>
                <Button
                  onClick={() => setLocation("/projects/new")}
                  disabled={!canCreate}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-10 px-4 rounded-xl gap-2 shadow-xs text-sm focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FolderPlus className="w-4 h-4" />
                  New Project
                </Button>
              </div>
            </div>

            {/* Toolbar: Search & Sort */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  placeholder="Search projects by name, URL..."
                  className="pl-10 h-10 rounded-xl bg-card border-border/80 text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
              </div>
              <div className="w-full sm:w-[200px]">
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger className="h-10 rounded-xl bg-card border-border/80 text-foreground text-sm focus-visible:ring-2 focus-visible:ring-ring">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border text-popover-foreground rounded-xl shadow-lg">
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="alpha">Alphabetical</SelectItem>
                    <SelectItem value="updated">Recently Updated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Projects Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {paginatedProjects.map((project) => {
                const state = getProjectState(project);
                return (
                  <div
                    key={project.id}
                    className="group flex flex-col justify-between rounded-2xl bg-card border border-border/80 hover:border-primary/50 shadow-xs hover:shadow-md transition-all duration-200 p-6 relative overflow-hidden"
                  >
                    <div className="space-y-3.5 relative z-10">
                      
                      {/* Status Badges & Menu */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {state.isLive ? (
                            <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-semibold px-2.5 py-0.5 gap-1.5 rounded-full text-xs">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              Live
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-border font-medium px-2.5 py-0.5 gap-1.5 rounded-full text-xs">
                              <Laptop className="w-3 h-3 text-muted-foreground" />
                              Development
                            </Badge>
                          )}

                          {state.isLive && (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-medium px-2 py-0.5 text-[11px] rounded-full">
                              AI Connected
                            </Badge>
                          )}
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Project actions" className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 bg-popover border border-border text-popover-foreground rounded-xl shadow-lg">
                            <DropdownMenuItem className="rounded-lg my-0.5 cursor-pointer text-xs" onClick={() => setLocation(`/projects/${project.id}/edit`)}>
                              <Pencil className="w-3.5 h-3.5 mr-2 text-muted-foreground" /> Edit Project
                            </DropdownMenuItem>
                            <DropdownMenuItem className="rounded-lg my-0.5 cursor-pointer text-xs" onClick={() => copyShareLink(project.shareToken)}>
                              <Copy className="w-3.5 h-3.5 mr-2 text-muted-foreground" /> Copy Preview Link
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="rounded-lg my-0.5 cursor-pointer text-xs"
                              onClick={() => toggleMutation.mutate({ id: project.id, isActive: !project.isActive })}
                            >
                              {project.isActive ? "Deactivate Assistant" : "Activate Assistant"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive hover:bg-destructive/10 rounded-lg my-0.5 cursor-pointer text-xs"
                              onClick={() => setDeletingId(project.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Project
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Title & Website URL */}
                      <div>
                        <h3 className="font-sans text-xl font-semibold text-foreground tracking-tight truncate group-hover:text-primary transition-colors">
                          {project.name}
                        </h3>
                        <p className="text-xs font-mono text-muted-foreground/80 mt-1 truncate flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span>{state.displayUrl}</span>
                        </p>
                      </div>

                      {/* Description */}
                      <p className="text-muted-foreground text-xs line-clamp-2 leading-relaxed">
                        {project.description || project.systemPrompt}
                      </p>
                    </div>

                    {/* Footer / CTA */}
                    <div className="pt-4 mt-4 border-t border-border/60 flex items-center justify-between gap-3 relative z-10">
                      {!state.isLive ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground font-medium">Setup:</span>
                          <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                            {state.setupPercent}% Complete
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground font-medium">
                          {project.knowledgeCount || 0} Knowledge Sources
                        </span>
                      )}

                      <div className="flex items-center gap-2 ml-auto">
                        <Button
                          onClick={() => setLocation(`/projects/${project.id}/edit`)}
                          variant={state.isLive ? "default" : "outline"}
                          className={`h-9 px-4 rounded-xl font-semibold text-xs gap-1.5 ${
                            state.isLive
                              ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
                              : "border-border text-foreground hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          {state.isLive ? "Open Dashboard" : "Continue Setup"}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3">
                <p className="text-xs text-muted-foreground">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedProjects.length)} of {filteredAndSortedProjects.length} projects
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    className="rounded-lg h-8 text-xs"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    className="rounded-lg h-8 text-xs"
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
        <AlertDialogContent className="bg-card border border-border rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground text-lg">Delete project?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm">
              This will permanently delete this project and all associated configuration and chat history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="border-border rounded-xl h-9 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0 rounded-xl h-9 text-xs"
              onClick={() => {
                if (deletingId) deleteMutation.mutate(deletingId);
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Interactive Demo Dialog */}
      <Dialog open={isExploreOpen} onOpenChange={setIsExploreOpen}>
        <DialogContent className="max-w-xl bg-card border border-border text-foreground p-6 rounded-2xl shadow-xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="font-serif text-xl font-bold tracking-tight">
              Explore NOVA Business AI
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              See what a complete NOVA project looks like before connecting your own website.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3 p-4 rounded-xl bg-muted/40 border border-border space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <div>
                <span className="font-semibold text-sm text-foreground">Apex Dynamics — Sandbox Demo</span>
                <p className="text-xs text-muted-foreground">Enterprise Business Consulting</p>
              </div>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-[11px]">
                Demo Mode
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Explore business intelligence, RAG knowledge sources, live widget customization, and agent control in a safe sandbox environment.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/60">
            <Button variant="ghost" size="sm" onClick={() => setIsExploreOpen(false)} className="rounded-lg text-xs">
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setIsExploreOpen(false);
                setLocation("/projects/00000000-0000-4000-8000-000000000000/edit");
              }}
              className="bg-primary text-primary-foreground font-semibold rounded-xl gap-1.5 text-xs"
            >
              Open Demo Project <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
