import React, { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { apiUrl } from "@/lib/api-url";
import { AgentControlCenter } from "@/components/agent-control/AgentControlCenter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cpu, Folder, Plus, Loader2, Sparkles, AlertCircle } from "lucide-react";

interface Project {
  id: string;
  name: string;
  isActive: boolean;
}

export default function AgentControlPage() {
  const params = useParams<{ projectId?: string }>();
  const [location, setLocation] = useLocation();
  const authFetch = useAuthFetch();
  const { user } = useAuth();

  // Extract from query params if not in route params
  const getQueryProjectId = () => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      return searchParams.get("projectId") || null;
    }
    return null;
  };

  const initialParamId = params.projectId || getQueryProjectId();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialParamId);

  // Fetch authorized projects
  const {
    data: projects = [],
    isLoading: isLoadingProjects,
    isError: isProjectsError,
  } = useQuery({
    queryKey: ["agent-control-projects"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/projects"));
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json() as Promise<Project[]>;
    },
    enabled: !!user,
    staleTime: 1000 * 60, // 1 min
  });

  // Effective project ID: either selected or first available, fallback to demo project
  const effectiveProjectId =
    selectedProjectId ||
    (projects.length > 0 ? projects[0].id : "00000000-0000-4000-8000-000000000000");

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("projectId", id);
      window.history.replaceState(null, "", url.toString());
    }
  };

  if (isLoadingProjects && !selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading projects...</p>
      </div>
    );
  }

  const currentProjectName =
    projects.find((p) => p.id === effectiveProjectId)?.name ||
    (effectiveProjectId === "00000000-0000-4000-8000-000000000000" || effectiveProjectId === "demo"
      ? "Apex Dynamics — Demo"
      : "Selected Project");

  return (
    <div className="flex-1 w-full min-w-0 px-6 py-6 md:px-8 lg:px-10 max-w-7xl mx-auto space-y-6">
      {/* Platform Level Header & Project Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
              Agent Control Center
            </h1>
            <Badge variant="outline" className="text-xs font-bold text-primary bg-primary/10 border-primary/20">
              NOVA Business AI
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitor, inspect, and trigger tool executions with cryptographic risk governance.
          </p>
        </div>

        {/* Project Switcher Select */}
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
            Active Project:
          </span>
          <Select
            value={effectiveProjectId}
            onValueChange={handleSelectProject}
          >
            <SelectTrigger className="w-[220px] h-9 text-xs font-semibold rounded-xl bg-card border-border">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs font-medium">
                  {p.name}
                </SelectItem>
              ))}
              <SelectItem
                value="00000000-0000-4000-8000-000000000000"
                className="text-xs font-medium text-amber-400"
              >
                🧪 Apex Dynamics (Demo)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Agent Control Center Instance */}
      <AgentControlCenter projectId={effectiveProjectId} />
    </div>
  );
}
