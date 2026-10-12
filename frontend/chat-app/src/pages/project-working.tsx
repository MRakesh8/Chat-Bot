import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ProjectGuide } from "@/components/project/project-guide";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { apiUrl } from "@/lib/api-url";
import { ArrowLeft, Layers } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Project = {
  id: string;
  name: string;
  websiteUrl?: string | null;
};

export default function ProjectWorkingPage() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const authFetch = useAuthFetch();
  const { session, dbUser, activeOrganizationId } = useAuth();

  const { data: projectList } = useQuery({
    queryKey: ["projects", activeOrganizationId, dbUser?.id],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/projects"));
      if (!res.ok) return [];
      return res.json() as Promise<Project[]>;
    },
    enabled: !!session,
  });

  // Effective project resolution: route params -> URL query -> first user project -> demo project
  const urlQueryId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("projectId") : null;
  const effectiveProjectId =
    params.id ||
    urlQueryId ||
    projectList?.[0]?.id ||
    "00000000-0000-4000-8000-000000000000";

  const handleSelectProject = (newId: string) => {
    setLocation(`/projects/${newId}/working`);
  };

  const handleSelectTab = (tab: string) => {
    setLocation(`/projects/${effectiveProjectId}/edit?tab=${tab}`);
  };

  return (
    <div className="flex w-full h-full bg-transparent overflow-x-hidden">
      <div className="flex-1 p-6 md:p-8 text-foreground max-w-6xl mx-auto space-y-6">
        
        {/* Navigation Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/80">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/projects")}
              className="gap-2 text-xs h-9 px-3 rounded-xl border border-border/60 hover:bg-accent text-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Projects</span>
            </Button>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20 gap-1 px-2.5 py-1 rounded-full font-semibold">
                <Layers className="w-3 h-3" />
                Project Working
              </Badge>
            </div>
          </div>

          {/* Project Context Switcher if multiple projects exist */}
          {projectList && projectList.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">Active Scope:</span>
              <Select value={effectiveProjectId} onValueChange={handleSelectProject}>
                <SelectTrigger className="h-9 min-w-[180px] text-xs rounded-xl bg-card border-border/80 text-foreground">
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border text-popover-foreground rounded-xl shadow-lg">
                  {projectList.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Existing Project Guide Component Reused Directly */}
        <ProjectGuide
          projectId={effectiveProjectId}
          onSelectTab={handleSelectTab}
        />
      </div>
    </div>
  );
}
