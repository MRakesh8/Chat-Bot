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
  Upload,
  CreditCard,
  Loader2
} from "lucide-react";
import { TableSkeleton } from "@/components/ui/skeletons";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl } from "@/lib/api-url";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
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

  const [activeTab, setActiveTab] = useState<"users" | "projects" | "keys" | "clarity" | "settings" | "errors" | "supabase" | "payments">("users");
  
  // System Settings state
  const [globalAiPrompt, setGlobalAiPrompt] = useState("");
  const [globalUpiId, setGlobalUpiId] = useState("");
  const [globalQrCodeUrl, setGlobalQrCodeUrl] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  
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
    enabled: isAdmin && (activeTab === "settings" || activeTab === "payments"),
  });

  useEffect(() => {
    if (globalSettings?.NORMAL_AI_PROMPT !== undefined) {
      setGlobalAiPrompt(globalSettings.NORMAL_AI_PROMPT);
    }
    if (globalSettings?.PAYMENT_UPI_ID !== undefined) {
      setGlobalUpiId(globalSettings.PAYMENT_UPI_ID);
    } else {
      setGlobalUpiId("rakesh837m@okaxis"); // default fallback
    }
    if (globalSettings?.PAYMENT_QR_CODE_URL !== undefined) {
      setGlobalQrCodeUrl(globalSettings.PAYMENT_QR_CODE_URL);
    } else {
      setGlobalQrCodeUrl("/qr-code.png");
    }
  }, [globalSettings, activeTab]);

  // System Errors Fetch
  const { data: systemErrors, isLoading: errorsLoading } = useQuery({
    queryKey: ["super-admin-errors"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/super-admin/errors"));
      if (!res.ok) throw new Error("Failed to load system errors");
      return res.json() as Promise<any[]>;
    },
    enabled: isAdmin && activeTab === "errors",
    refetchInterval: activeTab === "errors" ? 5000 : false,
  });

  // Fetch Payments
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["super-admin-payments"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/super-admin/payments"));
      if (!res.ok) throw new Error("Failed to load payments");
      return res.json() as Promise<any[]>;
    },
    enabled: isAdmin && activeTab === "payments",
  });

  // Supabase Stats Fetch
  const { data: supabaseStats, isLoading: supabaseLoading } = useQuery({
    queryKey: ["super-admin-supabase"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/super-admin/supabase-stats"));
      if (!res.ok) throw new Error("Failed to load supabase stats");
      return res.json() as Promise<any>;
    },
    enabled: isAdmin && activeTab === "supabase",
    refetchInterval: activeTab === "supabase" ? 10000 : false,
  });

  const [fixingErrorId, setFixingErrorId] = useState<string | null>(null);
  const [fixSuggestion, setFixSuggestion] = useState<string | null>(null);

  const getErrorFix = async (id: string) => {
    setFixingErrorId(id);
    setFixSuggestion(null);
    try {
      const res = await authFetch(apiUrl(`/api/super-admin/errors/${id}/fix`), { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate fix");
      const data = await res.json();
      setFixSuggestion(data.fixSuggestion);
    } catch (err: any) {
      toast({ title: "Failed to generate fix", description: err.message, variant: "destructive" });
    } finally {
      setFixingErrorId(null);
    }
  };

  const updateGlobalSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await authFetch(apiUrl("/api/super-admin/global-settings"), {
        method: "PATCH",
        body: JSON.stringify({ 
          NORMAL_AI_PROMPT: globalAiPrompt,
          PAYMENT_UPI_ID: globalUpiId,
          PAYMENT_QR_CODE_URL: globalQrCodeUrl
        }),
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

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "HEALTHY": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "QUOTA_EXCEEDED": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "COOLDOWN":
      case "UNHEALTHY": return "bg-rose-500/10 text-rose-500 border-rose-500/20";
      case "INVALID": return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "HEALTHY": return <CheckCircle2 className="w-4 h-4 mr-1" />;
      case "QUOTA_EXCEEDED": return <AlertTriangle className="w-4 h-4 mr-1" />;
      case "COOLDOWN":
      case "UNHEALTHY": return <Clock className="w-4 h-4 mr-1" />;
      case "INVALID": return <XCircle className="w-4 h-4 mr-1" />;
      default: return <AlertCircle className="w-4 h-4 mr-1" />;
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
            { id: "payments", label: "Payments", icon: CreditCard },
            { id: "settings", label: "System Settings", icon: Settings2 },
            { id: "keys", label: "System Keys Health", icon: Key },
            { id: "errors", label: "System Errors", icon: AlertCircle },
            { id: "supabase", label: "Supabase Monitor", icon: Activity },
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
              <TableSkeleton rows={8} />
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="p-4 font-medium">User Email</th>
                      <th className="p-4 font-medium">Role</th>
                      <th className="p-4 font-medium">Projects</th>
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
                        <td className="p-4 text-center font-medium">
                          {u.projectCount || 0}
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
              <TableSkeleton rows={8} />
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

        {/* PAYMENTS TAB */}
        {activeTab === "payments" && (
          <div className="max-w-7xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold">Manual Payments</h2>
            {settingsLoading ? (
              <div className="flex justify-center p-12"><Loader2 className="animate-spin text-muted-foreground w-8 h-8" /></div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold mb-1">Manual Payment Configuration</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure the UPI ID and QR code image shown on the Deployment Paywall.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">UPI ID</label>
                      <Input 
                        value={globalUpiId}
                        onChange={(e) => setGlobalUpiId(e.target.value)}
                        placeholder="e.g. yourname@okaxis"
                        className="font-mono bg-background"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">QR Code Image</label>
                      <div className="flex items-center gap-3">
                        {globalQrCodeUrl && (
                          <div className="w-12 h-12 rounded-lg border border-border bg-white overflow-hidden flex-none">
                            <img src={globalQrCodeUrl} className="w-full h-full object-contain" alt="QR Code preview" />
                          </div>
                        )}
                        <Input 
                          type="file" 
                          accept="image/*" 
                          disabled={isUploadingQr}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setIsUploadingQr(true);
                            try {
                              const ext = file.name.split('.').pop();
                              const fileName = `qr_config_${Date.now()}.${ext}`;
                              const filePath = `payments/${fileName}`;
                              
                              const formData = new FormData();
                              formData.append("file", file);
                              formData.append("storagePath", filePath);

                              const token = session?.access_token;
                              const res = await fetch(apiUrl("/api/files/upload-public"), {
                                method: "POST",
                                headers: token ? { Authorization: `Bearer ${token}` } : {},
                                body: formData
                              });

                              if (!res.ok) {
                                const errData = await res.json().catch(() => ({}));
                                throw new Error(errData.error || "Upload failed");
                              }

                              const data = await res.json();
                              setGlobalQrCodeUrl(data.publicUrl);
                              toast({ title: "QR Code Uploaded", description: "Remember to save settings." });
                            } catch (err: any) {
                              toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
                            } finally {
                              setIsUploadingQr(false);
                            }
                          }}
                          className="cursor-pointer bg-background"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-4 border-t border-border mt-4">
                  <Button onClick={updateGlobalSettings} disabled={savingSettings} className="gap-2">
                    {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Payment Config
                  </Button>
                </div>
              </div>
            )}
            {paymentsLoading ? (
              <TableSkeleton rows={8} />
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="p-4 font-medium">Date</th>
                      <th className="p-4 font-medium">User</th>
                      <th className="p-4 font-medium">Amount</th>
                      <th className="p-4 font-medium">UTR</th>
                      <th className="p-4 font-medium">Status</th>
                      <th className="p-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payments?.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="p-4">{new Date(p.createdAt).toLocaleDateString()}</td>
                        <td className="p-4">{p.user?.email}</td>
                        <td className="p-4 font-bold">₹{p.amount / 100}</td>
                        <td className="p-4 font-mono text-xs">{p.utrTransactionId || "N/A"}</td>
                        <td className="p-4">
                          <Badge variant={p.status === 'verified' ? 'default' : p.status === 'rejected' ? 'destructive' : 'secondary'}>
                            {p.status}
                          </Badge>
                        </td>
                        <td className="p-4 gap-2 flex">
                          {p.status === 'pending' && (
                            <>
                              <Button size="sm" onClick={async () => {
                                await authFetch(apiUrl(`/api/super-admin/payments/${p.id}/approve`), { method: 'POST' });
                                queryClient.invalidateQueries({ queryKey: ["super-admin-payments"] });
                              }}>Approve</Button>
                              <Button size="sm" variant="destructive" onClick={async () => {
                                await authFetch(apiUrl(`/api/super-admin/payments/${p.id}/reject`), { method: 'POST' });
                                queryClient.invalidateQueries({ queryKey: ["super-admin-payments"] });
                              }}>Reject</Button>
                            </>
                          )}
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
                {/* Aggregate Summary Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Total Keys Card */}
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-primary/10 transition-all duration-500" />
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-primary/10 rounded-xl text-primary">
                        <Key className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-emerald-500 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        {report.summary.healthyKeys} / {report.summary.totalSystemKeys} Active
                      </span>
                    </div>
                    <div className="text-3xl font-black tracking-tight mb-1">{report.summary.totalSystemKeys}</div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total System Keys</div>
                  </div>

                  {/* Overall Success Rate Card */}
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-emerald-500/10 transition-all duration-500" />
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-500">
                        <Activity className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">Lifetime Metrics</span>
                    </div>
                    <div className="text-3xl font-black tracking-tight mb-1">{report.summary.overallSuccessRatePercent}%</div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overall Success Rate</div>
                  </div>

                  {/* Aggregate Requests Card */}
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-blue-500/10 transition-all duration-500" />
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-blue-500/10 rounded-xl text-blue-500">
                        <Zap className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">All Models</span>
                    </div>
                    <div className="text-3xl font-black tracking-tight mb-1">{report.summary.aggregateRequests}</div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aggregate Requests</div>
                  </div>
                  
                  {/* Today's Usage Card */}
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-amber-500/10 transition-all duration-500" />
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-amber-500/10 rounded-xl text-amber-500">
                        <Clock className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">Reset Midnight UTC</span>
                    </div>
                    <div className="text-3xl font-black tracking-tight mb-1">{report.summary.aggregateDailyUsed}</div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today's Usage</div>
                  </div>
                </div>
                
                {/* Key Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {report.keys.map((key: any) => {
                    const progressPercent = key.metrics.dailyLimit 
                      ? Math.min(100, Math.round((key.metrics.dailyUsed / key.metrics.dailyLimit) * 100))
                      : 0;
                    
                    return (
                      <div key={key.id} className="bg-card border border-border rounded-2xl flex flex-col shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-primary/30 group-hover:bg-primary transition-colors" />
                        
                        {/* Header */}
                        <div className="p-5 border-b border-border flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-foreground tracking-tight">{key.name}</h3>
                              {key.isPrimary && (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-primary/15 text-primary rounded-full border border-primary/20 uppercase tracking-wide">
                                  Primary
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono flex items-center gap-1.5">
                              <span className="uppercase font-bold text-foreground/85">{key.provider}</span>
                              <span>•</span>
                              <span>{key.maskedKey}</span>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full border text-xs font-bold flex items-center shadow-sm ${getStatusBadgeClass(key.status)}`}>
                            {getStatusIcon(key.status)}
                            {key.status.replace("_", " ")}
                          </span>
                        </div>

                        {/* Metrics Panel */}
                        <div className="p-5 flex-1 space-y-4">
                          {/* Daily Usage Progress Bar */}
                          <div>
                            <div className="flex justify-between items-center text-xs font-semibold mb-1.5">
                              <span className="text-muted-foreground">Daily Request Quota</span>
                              <span className="text-foreground">
                                {key.metrics.dailyUsed} / {key.metrics.dailyLimit !== null ? key.metrics.dailyLimit : "∞"} requests
                              </span>
                            </div>
                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  progressPercent > 80 
                                    ? "bg-rose-500" 
                                    : progressPercent > 50 
                                    ? "bg-amber-500" 
                                    : "bg-primary"
                                }`}
                                style={{ width: `${key.metrics.dailyLimit !== null ? progressPercent : 0}%` }}
                              />
                            </div>
                          </div>

                          {/* Request Stats Grid */}
                          <div className="grid grid-cols-3 gap-2 text-center bg-muted/35 p-3 rounded-xl border border-border">
                            <div>
                              <div className="text-lg font-black tracking-tight text-foreground">{key.metrics.totalRequests}</div>
                              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Requests</div>
                            </div>
                            <div>
                              <div className="text-lg font-black tracking-tight text-emerald-500">{key.metrics.totalSuccesses}</div>
                              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Successes</div>
                            </div>
                            <div>
                              <div className="text-lg font-black tracking-tight text-rose-500">{key.metrics.totalFailures}</div>
                              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Failures</div>
                            </div>
                          </div>

                          {/* Efficiency Metrics */}
                          <div className="flex items-center justify-between text-xs border-b border-border/50 pb-2">
                            <span className="text-muted-foreground font-medium">Efficiency Rates</span>
                            <span className="font-semibold text-foreground">
                              {key.metrics.successRatePercent}% success rate / {key.metrics.failureRatePercent}% error rate
                            </span>
                          </div>

                          {/* Cooldown Info */}
                          {key.cooldownRemainingMinutes > 0 && (
                            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl p-3 text-xs flex items-start gap-2.5">
                              <Clock className="w-4 h-4 flex-none mt-0.5" />
                              <div>
                                <span className="font-bold">Active Cooling Period:</span> The key is temporarily benched for another <span className="font-bold">{key.cooldownRemainingMinutes} minutes</span> to allow the remote Gemini API rate quotas to reset.
                              </div>
                            </div>
                          )}

                          {/* Failure Reason Box */}
                          {key.failureReason && (
                            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-600 rounded-xl p-3 text-xs flex flex-col gap-1.5">
                              <div className="flex items-center gap-1.5 font-bold">
                                <AlertCircle className="w-4 h-4" />
                                Last Logged Failure Reason
                              </div>
                              <div className="font-mono bg-background/50 p-2 rounded border border-rose-500/15 break-all max-h-24 overflow-y-auto">
                                {key.failureReason}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Card Footer Timestamps */}
                        <div className="px-5 py-3 border-t border-border bg-muted/10 text-[10px] text-muted-foreground flex justify-between">
                          <span>Last Success: {key.lastSuccess ? new Date(key.lastSuccess).toLocaleTimeString() : "Never"}</span>
                          <span>Last Failure: {key.lastFailure ? new Date(key.lastFailure).toLocaleTimeString() : "Never"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* SUPABASE TAB */}
        {activeTab === "supabase" && (
          <div className="flex-1 p-6 overflow-y-auto">
            <h2 className="text-2xl font-black tracking-tight mb-6">Supabase Database & Storage Monitor</h2>
            {supabaseLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M21 5c0 1.66-4 3-9 3s-9-1.34-9-3s4-3 9-3s9 1.34 9 3"/></svg>
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Database Size</h3>
                        <p className="text-xs text-muted-foreground">Postgres Volume</p>
                      </div>
                    </div>
                    <div className="text-4xl font-black">{supabaseStats?.database?.sizeStr}</div>
                    <div className="mt-4 text-xs font-mono text-muted-foreground break-all">
                      {supabaseStats?.database?.bytes} total bytes
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Storage Buckets</h3>
                        <p className="text-xs text-muted-foreground">Blob Storage</p>
                      </div>
                    </div>
                    <div className="text-4xl font-black">
                      {((supabaseStats?.storage?.bytes || 0) / (1024 * 1024)).toFixed(2)} <span className="text-xl">MB</span>
                    </div>
                    <div className="mt-4 text-xs font-mono text-muted-foreground break-all">
                      {supabaseStats?.storage?.bytes || 0} total bytes
                    </div>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                  <h3 className="font-bold text-lg mb-4">User Storage Consumption</h3>
                  {supabaseStats?.storage?.perUser?.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No users have uploaded files yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {supabaseStats?.storage?.perUser?.map((u: any, idx: number) => {
                        const userObj = users?.find(du => du.id === u.user_id);
                        return (
                          <div key={idx} className="flex items-center justify-between p-3 border border-border/50 rounded-xl">
                            <div>
                              <div className="font-medium text-sm">{userObj?.email || "Unknown User"}</div>
                              <div className="text-xs text-muted-foreground font-mono">{u.user_id}</div>
                            </div>
                            <div className="font-bold text-foreground">
                              {(Number(u.bytes) / (1024 * 1024)).toFixed(2)} MB
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {/* SYSTEM ERRORS TAB */}
        {activeTab === "errors" && (
          <div className="flex-1 p-6 overflow-y-auto">
            <h2 className="text-2xl font-black tracking-tight mb-6">System Errors & Diagnostics</h2>
            
            {errorsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : systemErrors?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground bg-card border border-border rounded-xl">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-foreground">All Systems Operational</h3>
                <p>No system errors have been logged recently.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {systemErrors?.map((err) => (
                  <div key={err.id} className="bg-card border border-border rounded-xl p-5 shadow-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-rose-500/10 text-rose-500 rounded-lg">
                          <AlertCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-foreground">{err.source.toUpperCase()} Error</h3>
                            <span className="text-xs font-mono text-muted-foreground">{new Date(err.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="text-sm font-medium text-rose-500 mt-1">{err.message}</p>
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="bg-primary/5 border-primary/20 hover:bg-primary/10 text-primary gap-2"
                        onClick={() => getErrorFix(err.id)}
                        disabled={fixingErrorId === err.id}
                      >
                        {fixingErrorId === err.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        Suggest Fix with AI
                      </Button>
                    </div>

                    {err.stack && (
                      <div className="bg-muted p-3 rounded-lg overflow-x-auto mb-4">
                        <pre className="text-[10px] font-mono text-muted-foreground">{err.stack}</pre>
                      </div>
                    )}
                    
                    {fixSuggestion && fixingErrorId !== err.id && (
                      <div className="mt-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <div className="flex items-center gap-2 mb-2 font-bold text-blue-500">
                          <Zap className="w-4 h-4" />
                          AI Suggested Fix
                        </div>
                        <div className="text-sm prose prose-sm dark:prose-invert max-w-none text-foreground/90 whitespace-pre-wrap">
                          {fixSuggestion}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
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
