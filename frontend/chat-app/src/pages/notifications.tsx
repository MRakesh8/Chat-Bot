import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { apiUrl } from "@/lib/api-url";
import { Notifications } from "@/components/project/notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, Plus, Loader2 } from "lucide-react";

type Project = {
  id: string;
  name: string;
  isActive: boolean;
};

export default function NotificationsPage() {
  const [, setLocation] = useLocation();
  const authFetch = useAuthFetch();

  const getUrlParams = () => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      return {
        projectId: searchParams.get("projectId") || null,
      };
    }
    return { projectId: null };
  };

  const initialParams = getUrlParams();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialParams.projectId);

  useEffect(() => {
    const { projectId } = getUrlParams();
    if (projectId) setSelectedProjectId(projectId);
  }, []);

  const { data: projects, isLoading: isLoadingProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/projects"));
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json() as Promise<Project[]>;
    },
    staleTime: 30000,
  });

  const effectiveProjectId = selectedProjectId || (projects && projects.length > 0 ? projects[0].id : null);

  const handleProjectSelect = (id: string) => {
    setSelectedProjectId(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("projectId", id);
      window.history.replaceState(null, "", url.toString());
    }
  };

  return (
    <div className="flex w-full h-full bg-transparent overflow-x-hidden">
      <div className="flex-1 p-6 md:p-8 text-foreground max-w-4xl mx-auto space-y-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs px-2.5 py-0.5 rounded-full font-semibold">
              Global Account Scope
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage alert notifications, lead captures, system security events, and automated workflow activity.
          </p>
        </div>

        {isLoadingProjects ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 border border-border rounded-2xl bg-card/30">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading workspace notifications...</p>
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="space-y-6">
            {projects.length > 1 && (
              <div className="p-4 rounded-2xl bg-card border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Project Selection</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Select a project to view its alert notifications and event logs.</p>
                </div>
                <Select value={effectiveProjectId || ""} onValueChange={handleProjectSelect}>
                  <SelectTrigger className="w-full sm:w-[240px] h-10 rounded-xl bg-secondary border-border text-foreground">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground rounded-xl">
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="rounded-lg my-0.5">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {effectiveProjectId ? (
              <Notifications
                projectId={effectiveProjectId}
                onSelectTab={(tab) => {
                  setLocation(`/projects/${effectiveProjectId}/edit?tab=${tab}`);
                }}
              />
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center border border-dashed border-border rounded-2xl bg-card/30">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground mb-1">No Projects Found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Alert notifications are linked to projects. Create your first project to configure and view alert notifications.
              </p>
            </div>
            <Button onClick={() => setLocation("/projects/new")} className="gap-2 rounded-xl text-xs font-semibold">
              <Plus className="w-4 h-4" /> Create Project
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
