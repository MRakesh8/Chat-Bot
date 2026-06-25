import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  LayoutDashboard,
  FormInput,
  Table2,
  Compass,
  GitCompare,
  AlertTriangle,
  Brain,
  Bug,
  Save,
  type LucideIcon,
} from "lucide-react";

/** Shape of the context-settings payload from the API. */
interface ContextSettingsData {
  enabled: boolean;
  dashboardAnalysis: boolean;
  formAssistant: boolean;
  tableAnalysis: boolean;
  navigationAssistant: boolean;
  knowledgeComparison: boolean;
  mistakeDetection: boolean;
  contextMemory: boolean;
  developerDebugMode: boolean;
}

/** Metadata for a single feature toggle rendered in the card grid. */
interface FeatureToggle {
  key: keyof Omit<ContextSettingsData, "enabled">;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

/** All available feature toggles for the context engine. */
const FEATURE_TOGGLES: FeatureToggle[] = [
  {
    key: "dashboardAnalysis",
    label: "Dashboard Analysis",
    description: "Analyze dashboard widgets and metrics to provide contextual help.",
    icon: LayoutDashboard,
    color: "text-blue-500 bg-blue-500/10",
  },
  {
    key: "formAssistant",
    label: "Form Assistant",
    description: "Guide users through complex forms and validate inputs in real-time.",
    icon: FormInput,
    color: "text-green-500 bg-green-500/10",
  },
  {
    key: "tableAnalysis",
    label: "Table Analysis",
    description: "Understand tabular data to answer questions about rows, columns, and trends.",
    icon: Table2,
    color: "text-purple-500 bg-purple-500/10",
  },
  {
    key: "navigationAssistant",
    label: "Navigation Assistant",
    description: "Help users find the right page or feature inside the host application.",
    icon: Compass,
    color: "text-cyan-500 bg-cyan-500/10",
  },
  {
    key: "knowledgeComparison",
    label: "Knowledge Comparison",
    description: "Compare on-screen data with the knowledge base to surface insights.",
    icon: GitCompare,
    color: "text-amber-500 bg-amber-500/10",
  },
  {
    key: "mistakeDetection",
    label: "Mistake Detection",
    description: "Proactively detect potential errors or inconsistencies on the page.",
    icon: AlertTriangle,
    color: "text-red-500 bg-red-500/10",
  },
  {
    key: "contextMemory",
    label: "Context Memory",
    description: "Remember previously visited pages to give richer, multi-page answers.",
    icon: Brain,
    color: "text-pink-500 bg-pink-500/10",
  },
  {
    key: "developerDebugMode",
    label: "Developer Debug Mode",
    description: "Expose raw context payloads and token counts in the widget console.",
    icon: Bug,
    color: "text-orange-500 bg-orange-500/10",
  },
];

/** Default settings used when the API returns nothing yet. */
const DEFAULT_SETTINGS: ContextSettingsData = {
  enabled: false,
  dashboardAnalysis: true,
  formAssistant: true,
  tableAnalysis: true,
  navigationAssistant: true,
  knowledgeComparison: true,
  mistakeDetection: true,
  contextMemory: true,
  developerDebugMode: false,
};

/**
 * ContextSettings — project-level settings panel for the Website Context Engine.
 *
 * Rendered inside the project-edit page. Fetches current settings on mount and
 * persists changes via an explicit "Save" button.
 */
export function ContextSettings({ projectId }: { projectId: string }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Auth-wrapped fetch (matches deployment.tsx pattern) ────────────
  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
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
    },
    [session?.access_token],
  );

  // ── Fetch current settings ─────────────────────────────────────────
  const { data: remote, isLoading } = useQuery({
    queryKey: ["context-settings", projectId],
    queryFn: async () => {
      const res = await authFetch(
        apiUrl(`/api/projects/${projectId}/widget/context-settings`),
      );
      if (!res.ok) {
        // Endpoint may not exist yet — fall back to defaults
        return DEFAULT_SETTINGS;
      }
      return res.json() as Promise<ContextSettingsData>;
    },
    enabled: !!projectId,
  });

  // ── Local state mirrors remote, allows unsaved edits ───────────────
  const [settings, setSettings] = useState<ContextSettingsData>(DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (remote) {
      setSettings(remote);
      setDirty(false);
    }
  }, [remote]);

  /** Toggle a single key in local state. */
  const toggle = (key: keyof ContextSettingsData) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  };

  // ── Save mutation ──────────────────────────────────────────────────
  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: async (payload: ContextSettingsData) => {
      const res = await authFetch(
        apiUrl(`/api/projects/${projectId}/widget/context-settings`),
        { method: "PUT", body: JSON.stringify(payload) },
      );
      if (!res.ok) throw new Error("Failed to save context settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["context-settings", projectId] });
      setDirty(false);
      toast({ title: "Context settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  // ── Loading state ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin w-6 h-6" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 mt-8">
      {/* Master toggle card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                Website Context Engine
                <Badge variant={settings.enabled ? "default" : "secondary"}>
                  {settings.enabled ? "Active" : "Disabled"}
                </Badge>
              </CardTitle>
              <CardDescription>
                Allow the widget to read on-screen content from the host website and use
                it as additional context when answering user questions.
              </CardDescription>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={() => toggle("enabled")}
              aria-label="Toggle Website Context Engine"
            />
          </div>
        </CardHeader>
      </Card>

      {/* Feature toggles — only visible when engine is enabled */}
      {settings.enabled && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Feature Toggles</CardTitle>
            <CardDescription>
              Enable or disable individual context capabilities for this project.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {FEATURE_TOGGLES.map(({ key, label, description, icon: Icon, color }) => (
                <Card key={key} className="bg-muted border-border">
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className={`p-3 rounded-full shrink-0 ${color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <Label htmlFor={key} className="text-sm font-medium cursor-pointer">
                        {label}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">{description}</p>
                    </div>
                    <Switch
                      id={key}
                      checked={settings[key]}
                      onCheckedChange={() => toggle(key)}
                      aria-label={`Toggle ${label}`}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Save button */}
            <div className="flex justify-end mt-6">
              <Button onClick={() => save(settings)} disabled={!dirty || isSaving}>
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
