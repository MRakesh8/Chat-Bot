import { useState, useEffect } from "react";
import { 
  BarChart3, 
  AlertCircle, 
  Key, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Zap, 
  Clock, 
  ShieldAlert,
  Users,
  LayoutDashboard,
  FolderOpen,
  Settings2,
  Save,
  Loader2
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-url";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

function useAuthFetch() {
  const { session } = useAuth();
  return async (url: string, options: RequestInit = {}) => {
    const token = session?.access_token;
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  };
}

interface KeyMetrics {
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  successRatePercent: number;
  failureRatePercent: number;
  dailyLimit: number | null;
  dailyUsed: number;
  remainingDailyQuota: number | null;
  lastResetAt: string;
}

interface SystemKeyReport {
  id: string;
  name: string;
  provider: string;
  maskedKey: string;
  status: "HEALTHY" | "COOLDOWN" | "QUOTA_EXCEEDED" | "INVALID" | "UNHEALTHY" | "DISABLED";
  isEnabled: boolean;
  isPrimary: boolean;
  lastSuccess: string | null;
  lastFailure: string | null;
  failureReason: string | null;
  cooldownUntil: string | null;
  cooldownRemainingMinutes: number;
  metrics: KeyMetrics;
}

interface ReportResponse {
  success: boolean;
  generatedAt: string;
  summary: any;
  keys: SystemKeyReport[];
}

export default function AdminConsolePage() {
  const { user, dbUser, session } = useAuth();
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [activeTab, setActiveTab] = useState<"users" | "projects" | "keys" | "clarity" | "settings">("users");
  
  // System Settings state
  const [globalAiPrompt, setGlobalAiPrompt] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  
  // System Keys state
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Custom Feature Modal State
  const [editingUser, setEditingUser] = useState<any>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Strict client-side admin check
  const isAdmin = user?.email === "rakesh837m@gmail.com" || 
                  dbUser?.role === "super_admin" ||
                  (import.meta.env.DEV || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  // Fetch Users
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["super-admin-users"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/super-admin/users"));
      if (!res.ok) throw new Error("Failed to load users");
      return res.json() as Promise<any[]>;
    },
    enabled: isAdmin && activeTab === "users",
  });

  // Fetch Global Settings
  const { data: globalSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["super-admin-global-settings"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/super-admin/global-settings"));
      if (!res.ok) throw new Error("Failed to load global settings");
      return res.json() as Promise<Record<string, string>>;
    },
    enabled: isAdmin && activeTab === "settings",
  });

  useEffect(() => {
    if (globalSettings?.NORMAL_AI_PROMPT !== undefined) {
      setGlobalAiPrompt(globalSettings.NORMAL_AI_PROMPT);
    }
  }, [globalSettings]);

  const updateGlobalSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await authFetch(apiUrl("/api/super-admin/global-settings"), {
        method: "PATCH",
        body: JSON.stringify({ NORMAL_AI_PROMPT: globalAiPrompt }),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      toast({ title: "Settings saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["super-admin-global-settings"] });
    } catch (err: any) {
      toast({ title: "Failed to save settings", description: err.message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  // Fetch Projects
  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["super-admin-projects"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/super-admin/projects"));
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json() as Promise<any[]>;
    },
    enabled: isAdmin && activeTab === "projects",
  });

  const updateFeaturesMutation = useMutation({
    mutationFn: async ({ id, features, role }: { id: string; features?: any; role?: string }) => {
      const body: any = {};
      if (features) body.features = features;
      if (role) body.role = role;
      
      const res = await authFetch(apiUrl(`/api/super-admin/users/${id}`), {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-users"] });
      toast({ title: "User updated successfully" });
      setEditingUser(null);
    },
    onError: (err: any) => toast({ title: "Failed to update user", description: err.message, variant: "destructive" }),
  });

  const fetchReport = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoadingKeys(true);
    setKeysError(null);

    try {
      const token = session?.access_token;
      const res = await fetch(apiUrl("/api/system/admin/keys-report"), {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (!res.ok) {
        if (res.status === 403) throw new Error("Access denied: Restricted to administrators.");
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch system keys report.");
      }

      const data: ReportResponse = await res.json();
      setReport(data);
    } catch (err: any) {
      setKeysError(err.message || "An error occurred while loading the report.");
    } finally {
      setLoadingKeys(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAdmin && activeTab === "keys") {
      fetchReport();
    }
  }, [isAdmin, activeTab]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col h-full bg-background items-center justify-center p-8">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-xl">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold mb-3 text-foreground tracking-tight">Access Denied</h2>
          <p className="text-muted-foreground mb-6">
            This dashboard is highly restricted and only accessible to administrators.
          </p>
        </div>
      </div>
    );
  }

  const openCustomFeatureModal = (u: any) => {
    setEditingUser(u);
    setJsonInput(JSON.stringify(u.features || {}, null, 2));
    setJsonError(null);
  };

  const saveCustomFeatures = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      updateFeaturesMutation.mutate({ id: editingUser.id, features: parsed });
    } catch (e) {
      setJsonError("Invalid JSON format. Please correct it before saving.");
    }
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-none p-4 border-b border-border flex flex-col md:flex-row md:items-center justify-between bg-card z-10 gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground tracking-tight">Admin Console</h1>
          <span className="ml-2 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">Super Admin</span>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap bg-muted/50 p-1 rounded-xl border border-border">
          {[
            { id: "users", label: "Users & Roles", icon: Users },
            { id: "projects", label: "Global Projects", icon: LayoutDashboard },
            { id: "settings", label: "System Settings", icon: Settings2 },
            { id: "keys", label: "System Keys Health", icon: Key },
            { id: "clarity", label: "Microsoft Clarity", icon: Activity },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                activeTab === tab.id 
                  ? "bg-card text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
        
        {activeTab === "keys" && (
          <Button 
            variant="outline"
            size="sm"
            className="bg-background/50 hover:bg-muted font-medium flex items-center gap-2 rounded-xl px-4"
            onClick={() => fetchReport(true)}
            disabled={loadingKeys || refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh Status"}
          </Button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto w-full p-6 bg-background/50">
        
        {/* USERS TAB */}
        {activeTab === "users" && (
          <div className="max-w-7xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold">Platform Users</h2>
            {usersLoading ? (
              <div className="flex justify-center p-12"><Loader2 className="animate-spin text-muted-foreground w-8 h-8" /></div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="p-4 font-medium">User Email</th>
                      <th className="p-4 font-medium">Role</th>
                      <th className="p-4 font-medium">Create Projects</th>
                      <th className="p-4 font-medium">Widget Studio</th>
                      <th className="p-4 font-medium">Context Engine</th>
                      <th className="p-4 font-medium">Advanced</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users?.map((u) => (
                      <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-4">{u.email}</td>
                        <td className="p-4">
                          <select 
                            className="bg-transparent border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary text-xs capitalize"
                            value={u.role}
                            onChange={(e) => updateFeaturesMutation.mutate({ id: u.id, role: e.target.value })}
                          >
                            <option value="user">User</option>
                            <option value="super_admin">Super Admin</option>
                          </select>
                        </td>
                        <td className="p-4">
                          <Switch
                            checked={u.features?.canCreateProject ?? true}
                            onCheckedChange={(c) => updateFeaturesMutation.mutate({ id: u.id, features: { ...u.features, canCreateProject: c }})}
                          />
                        </td>
                        <td className="p-4">
                          <Switch
                            checked={u.features?.canUseWidgetStudio ?? false}
                            onCheckedChange={(c) => updateFeaturesMutation.mutate({ id: u.id, features: { ...u.features, canUseWidgetStudio: c }})}
                          />
                        </td>
                        <td className="p-4">
                          <Switch
                            checked={u.features?.canUseContextEngine ?? false}
                            onCheckedChange={(c) => updateFeaturesMutation.mutate({ id: u.id, features: { ...u.features, canUseContextEngine: c }})}
                          />
                        </td>
                        <td className="p-4">
                          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openCustomFeatureModal(u)}>
                            <Settings2 className="w-3.5 h-3.5" /> Custom JSON
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PROJECTS TAB */}
        {activeTab === "projects" && (
          <div className="max-w-7xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold">Global Projects</h2>
            {projectsLoading ? (
              <div className="flex justify-center p-12"><Loader2 className="animate-spin text-muted-foreground w-8 h-8" /></div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="p-4 font-medium">Project Name</th>
                      <th className="p-4 font-medium">Owner ID</th>
                      <th className="p-4 font-medium">Status</th>
                      <th className="p-4 font-medium">Created</th>
                      <th className="p-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {projects?.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-4 font-medium">{p.name}</td>
                        <td className="p-4 text-xs font-mono text-muted-foreground">{p.userId}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${p.isActive ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-muted text-muted-foreground'}`}>
                            {p.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="p-4 text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
                        <td className="p-4">
                          <Button variant="outline" size="sm" className="gap-2 h-8" onClick={() => setLocation(`/admin/projects/${p.id}/edit`)}>
                            <FolderOpen className="w-3.5 h-3.5" /> Open
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* KEYS TAB */}
        {activeTab === "keys" && (
          <div className="max-w-7xl mx-auto space-y-6">
            {loadingKeys ? (
              <div className="flex flex-col items-center justify-center py-24 space-y-4">
                <RefreshCw className="w-10 h-10 text-primary animate-spin" />
                <p className="text-muted-foreground text-sm font-medium">Loading system keys health report...</p>
              </div>
            ) : keysError ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex items-start gap-4 text-red-500">
                <AlertCircle className="w-6 h-6 flex-none mt-0.5" />
                <div>
                  <h3 className="text-lg font-bold mb-1">Failed to load report</h3>
                  <p className="text-sm opacity-90">{keysError}</p>
                  <Button 
                    variant="outline" size="sm" 
                    className="mt-4 border-red-500/30 hover:bg-red-500/10 text-red-500 rounded-xl"
                    onClick={() => fetchReport()}
                  >
                    Retry Fetch
                  </Button>
                </div>
              </div>
            ) : report ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                    <div className="text-3xl font-black">{report.summary.totalSystemKeys}</div>
                    <div className="text-xs text-muted-foreground uppercase mt-1">Total System Keys</div>
                  </div>
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                    <div className="text-3xl font-black">{report.summary.overallSuccessRatePercent}%</div>
                    <div className="text-xs text-muted-foreground uppercase mt-1">Overall Success Rate</div>
                  </div>
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                    <div className="text-3xl font-black">{report.summary.aggregateRequests}</div>
                    <div className="text-xs text-muted-foreground uppercase mt-1">Aggregate Requests</div>
                  </div>
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                    <div className="text-3xl font-black">{report.summary.aggregateDailyUsed}</div>
                    <div className="text-xs text-muted-foreground uppercase mt-1">Today's Usage</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {report.keys.map((key) => (
                    <div key={key.id} className="bg-card border border-border rounded-2xl p-5">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-bold">{key.name}</h3>
                          <div className="text-xs text-muted-foreground font-mono">{key.maskedKey}</div>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 bg-muted rounded-md">{key.status}</span>
                      </div>
                      <div className="text-xs space-y-1">
                        <div>Daily Used: {key.metrics.dailyUsed} / {key.metrics.dailyLimit || "∞"}</div>
                        <div>Total Requests: {key.metrics.totalRequests}</div>
                        <div>Success Rate: {key.metrics.successRatePercent}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        )}
        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold">System Settings</h2>
            
            {settingsLoading ? (
               <div className="flex justify-center p-12"><Loader2 className="animate-spin text-muted-foreground w-8 h-8" /></div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
                <div>
                  <h3 className="text-lg font-bold mb-1">Normal AI Knowledge Base</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Provide instructions, chatbot details, or admin information for the default "Normal AI" (Gemini). The AI will refer to this knowledge base for relevant questions. Google Search Grounding is automatically enabled for live information.
                  </p>
                  <Textarea 
                    value={globalAiPrompt}
                    onChange={(e) => setGlobalAiPrompt(e.target.value)}
                    className="min-h-[300px] font-mono text-sm bg-background border-border"
                    placeholder="Enter global system instructions..."
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={updateGlobalSettings} disabled={savingSettings} className="gap-2">
                    {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Settings
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CLARITY TAB */}
        {activeTab === "clarity" && (
          <div className="flex-1 w-full flex flex-col items-center justify-center py-12">
            <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-xl">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Activity className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-3 text-foreground tracking-tight">Microsoft Clarity</h2>
              <p className="text-muted-foreground mb-8">
                For security reasons, Microsoft Clarity dashboards cannot be embedded directly within other applications. Please open the dashboard in a secure external window.
              </p>
              <Button 
                size="lg" 
                className="w-full font-medium rounded-xl shadow-lg"
                onClick={() => window.open('https://clarity.microsoft.com/projects/view/x6eohi99h7/dashboard?date=Last%203%20days', '_blank')}
              >
                Open Clarity Dashboard ↗
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* JSON Feature Editor Modal */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-[600px] bg-card border-border">
          <DialogHeader>
            <DialogTitle>Edit Advanced Features (JSON)</DialogTitle>
            <DialogDescription>
              Directly modify the raw JSON `features` object for <strong>{editingUser?.email}</strong>. 
              This allows you to assign custom limits or brand new experimental flags instantly.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <Textarea 
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="font-mono text-sm min-h-[250px] bg-background border-border focus-visible:ring-primary"
              spellCheck={false}
            />
            {jsonError && (
              <div className="text-red-500 text-sm mt-2 font-medium flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> {jsonError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button onClick={saveCustomFeatures} className="gap-2" disabled={updateFeaturesMutation.isPending}>
              {updateFeaturesMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
