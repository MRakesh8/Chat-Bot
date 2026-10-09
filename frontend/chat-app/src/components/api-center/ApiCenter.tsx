import { useState, useEffect } from "react";
import { 
  Key, 
  Bot, 
  BookOpen, 
  ShieldAlert, 
  Activity, 
  Sparkles, 
  Layers, 
  ExternalLink,
  Cpu
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api-url";
import { supabase } from "@/lib/supabase";
import { UserApiKeysTab, UserApiKey } from "./UserApiKeysTab";
import { ProjectApiKeysTab, ProjectApiKey, ProjectOption } from "./ProjectApiKeysTab";
import { ProviderGuides } from "./ProviderGuides";
import { AdminSystemHealthTab, AdminReportData } from "./AdminSystemHealthTab";

interface ApiCenterProps {
  initialTab?: string;
  defaultProjectId?: string;
}

export function ApiCenter({ initialTab = "user-keys", defaultProjectId }: ApiCenterProps) {
  const { user, dbUser } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  
  // User Keys State
  const [userKeys, setUserKeys] = useState<UserApiKey[]>([]);
  const [apiMode, setApiMode] = useState<string>("auto");
  const [loadingUserKeys, setLoadingUserKeys] = useState(true);

  // Projects & Project Keys State
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(defaultProjectId || "");
  const [projectKeys, setProjectKeys] = useState<ProjectApiKey[]>([]);
  const [loadingProjectKeys, setLoadingProjectKeys] = useState(false);

  // Admin System Health State
  const [adminReport, setAdminReport] = useState<AdminReportData | null>(null);
  const [loadingAdminReport, setLoadingAdminReport] = useState(false);

  const isDemoMode = typeof window !== "undefined" && window.location.hostname === "localhost";
  const isAdmin = dbUser?.role === "super_admin" || dbUser?.role === "admin" || (isDemoMode && !user);

  // Helper for authenticated fetch
  const authFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 
      "Content-Type": "application/json",
      ...(options.headers as any || {})
    };
    if (data.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    return fetch(url, { ...options, headers });
  };

  // 1. Fetch User Keys & Settings
  const fetchUserKeys = async () => {
    try {
      const res = await authFetch(apiUrl("/api/api-keys"));
      if (res.ok) {
        const json = await res.json();
        setUserKeys(json || []);
      }

      const settingsRes = await authFetch(apiUrl("/api/api-keys/settings"));
      if (settingsRes.ok) {
        const settingsJson = await settingsRes.json();
        if (settingsJson.apiMode) setApiMode(settingsJson.apiMode);
      }
    } catch (err) {
      console.error("Failed to fetch user API keys", err);
    } finally {
      setLoadingUserKeys(false);
    }
  };

  // 2. Fetch Projects List
  const fetchProjects = async () => {
    try {
      const res = await authFetch(apiUrl("/api/projects"));
      if (res.ok) {
        const json = await res.json();
        const projectList = (json.projects || json || []).map((p: any) => ({
          id: p.id,
          name: p.name || `Project ${p.id.slice(0, 8)}`,
          description: p.description
        }));
        setProjects(projectList);
        if (!selectedProjectId && projectList.length > 0) {
          setSelectedProjectId(projectList[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch projects for API Center", err);
    }
  };

  // 3. Fetch Project Keys for selected project
  const fetchProjectKeys = async (projId: string) => {
    if (!projId) return;
    setLoadingProjectKeys(true);
    try {
      const res = await authFetch(apiUrl(`/api/projects/${projId}/widget/api-keys`));
      if (res.ok) {
        const json = await res.json();
        setProjectKeys(json || []);
      }
    } catch (err) {
      console.error("Failed to fetch project API keys", err);
    } finally {
      setLoadingProjectKeys(false);
    }
  };

  // 4. Fetch Admin Health Report
  const fetchAdminReport = async () => {
    if (!isAdmin) return;
    setLoadingAdminReport(true);
    try {
      const res = await authFetch(apiUrl("/api/system/admin/keys-report"));
      if (res.ok) {
        const json = await res.json();
        setAdminReport(json);
      }
    } catch (err) {
      console.error("Failed to fetch admin keys report", err);
    } finally {
      setLoadingAdminReport(false);
    }
  };

  useEffect(() => {
    fetchUserKeys();
    fetchProjects();
    if (isAdmin) fetchAdminReport();

    const interval = setInterval(() => {
      fetchUserKeys();
      if (selectedProjectId) fetchProjectKeys(selectedProjectId);
      if (isAdmin) fetchAdminReport();
    }, 30000);

    return () => clearInterval(interval);
  }, [isAdmin]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectKeys(selectedProjectId);
    }
  }, [selectedProjectId]);

  // User Key Handlers
  const handleAddUserKey = async (data: { apiKey: string; name?: string; provider?: string }) => {
    const res = await authFetch(apiUrl("/api/api-keys"), {
      method: "POST",
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || json.message || "Failed to add API key");
    }
    toast({
      title: "API Key Added & Verified",
      description: `Successfully configured ${json.provider?.toUpperCase()} key with ${json.models?.length || 1} available models.`
    });
    fetchUserKeys();
  };

  const handleDeleteUserKey = async (id: string) => {
    const res = await authFetch(apiUrl(`/api/api-keys/${id}`), {
      method: "DELETE"
    });
    if (!res.ok) {
      const json = await res.json();
      toast({ title: "Failed to delete key", description: json.error, variant: "destructive" });
      return;
    }
    toast({ title: "API Key Deleted" });
    fetchUserKeys();
  };

  const handleVerifyUserKey = async (id: string) => {
    const res = await authFetch(apiUrl(`/api/api-keys/${id}/verify`), {
      method: "POST"
    });
    const json = await res.json();
    if (res.ok) {
      toast({ 
        title: "Key Connection Healthy", 
        description: `Verified with provider. Default model: ${json.defaultModel || "Active"}` 
      });
    } else {
      toast({ 
        title: "Verification Failed", 
        description: json.error || "Provider rejected API key.", 
        variant: "destructive" 
      });
    }
    fetchUserKeys();
  };

  const handleToggleUserEnabled = async (id: string, currentlyEnabled: boolean) => {
    const endpoint = currentlyEnabled ? "disable" : "enable";
    const res = await authFetch(apiUrl(`/api/api-keys/${id}/${endpoint}`), {
      method: "PATCH"
    });
    if (res.ok) {
      toast({ title: currentlyEnabled ? "Key Disabled" : "Key Enabled" });
      fetchUserKeys();
    }
  };

  const handleSetPrimaryUserKey = async (id: string) => {
    const res = await authFetch(apiUrl(`/api/api-keys/${id}/primary`), {
      method: "PATCH"
    });
    if (res.ok) {
      toast({ title: "Primary API Key Updated" });
      fetchUserKeys();
    }
  };

  const handleClearUserCooldown = async (id: string) => {
    const res = await authFetch(apiUrl(`/api/api-keys/${id}/reset-cooldown`), {
      method: "POST"
    });
    if (res.ok) {
      toast({ title: "Cooldown Reset", description: "Key status restored to Healthy." });
      fetchUserKeys();
    }
  };

  const handleReplaceUserKey = async (id: string, newKey: string) => {
    const res = await authFetch(apiUrl(`/api/api-keys/${id}`), {
      method: "PUT",
      body: JSON.stringify({ apiKey: newKey })
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || "Failed to replace API key.");
    }
    toast({ title: "API Key Replaced & Verified" });
    fetchUserKeys();
  };

  const handleModeChange = async (mode: string) => {
    setApiMode(mode);
    await authFetch(apiUrl("/api/api-keys/settings"), {
      method: "PUT",
      body: JSON.stringify({ apiMode: mode })
    });
    toast({ title: "Routing Mode Saved", description: `Active strategy: ${mode.replace("_", " ")}` });
  };

  const handleValidateKey = async (apiKey: string, provider?: string) => {
    const res = await authFetch(apiUrl("/api/api-keys/validate"), {
      method: "POST",
      body: JSON.stringify({ apiKey, provider })
    });
    const json = await res.json();
    if (!res.ok) {
      return { valid: false, provider: "unknown", defaultModel: "", models: [], error: json.error || "Validation failed" };
    }
    return json;
  };

  // Project Key Handlers
  const handleAddProjectKey = async (projId: string, data: { apiKey: string; name?: string }) => {
    const res = await authFetch(apiUrl(`/api/projects/${projId}/widget/api-keys`), {
      method: "POST",
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to add project key");
    toast({ title: `Added ${json.provider?.toUpperCase()} Project Key`, description: `Default model: ${json.model}` });
    fetchProjectKeys(projId);
  };

  const handleDeleteProjectKey = async (projId: string, keyId: string) => {
    const res = await authFetch(apiUrl(`/api/projects/${projId}/widget/api-keys/${keyId}`), {
      method: "DELETE"
    });
    if (res.ok) {
      toast({ title: "Project Key Deleted" });
      fetchProjectKeys(projId);
    }
  };

  const handleVerifyProjectKey = async (projId: string, keyId: string) => {
    const res = await authFetch(apiUrl(`/api/projects/${projId}/widget/api-keys/${keyId}/verify`), {
      method: "POST"
    });
    const json = await res.json();
    if (res.ok) {
      toast({ title: "Project Key Verified", description: `Healthy. Model: ${json.defaultModel}` });
    } else {
      toast({ title: "Verification Failed", description: json.error, variant: "destructive" });
    }
    fetchProjectKeys(projId);
  };

  const handleUpdateProjectModel = async (projId: string, keyId: string, model: string) => {
    const res = await authFetch(apiUrl(`/api/projects/${projId}/widget/api-keys/${keyId}`), {
      method: "PUT",
      body: JSON.stringify({ model })
    });
    if (res.ok) {
      toast({ title: "Model Updated", description: `Assigned: ${model}` });
      fetchProjectKeys(projId);
    }
  };

  const handleToggleProjectEnabled = async (projId: string, keyId: string, currentlyEnabled: boolean) => {
    const endpoint = currentlyEnabled ? "disable" : "enable";
    const res = await authFetch(apiUrl(`/api/projects/${projId}/widget/api-keys/${keyId}/${endpoint}`), {
      method: "PATCH"
    });
    if (res.ok) {
      toast({ title: currentlyEnabled ? "Key Disabled" : "Key Enabled" });
      fetchProjectKeys(projId);
    }
  };

  const handleSetPrimaryProjectKey = async (projId: string, keyId: string) => {
    const res = await authFetch(apiUrl(`/api/projects/${projId}/widget/api-keys/${keyId}/primary`), {
      method: "PATCH"
    });
    if (res.ok) {
      toast({ title: "Primary Model Updated" });
      fetchProjectKeys(projId);
    }
  };

  const handleClearProjectCooldown = async (projId: string, keyId: string) => {
    const res = await authFetch(apiUrl(`/api/projects/${projId}/widget/api-keys/${keyId}/reset-cooldown`), {
      method: "POST"
    });
    if (res.ok) {
      toast({ title: "Cooldown Reset" });
      fetchProjectKeys(projId);
    }
  };

  const handleReplaceProjectKey = async (projId: string, keyId: string, newKey: string) => {
    const res = await authFetch(apiUrl(`/api/projects/${projId}/widget/api-keys/${keyId}`), {
      method: "PUT",
      body: JSON.stringify({ apiKey: newKey })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to replace project key.");
    toast({ title: "Project Key Replaced & Verified" });
    fetchProjectKeys(projId);
  };

  // Admin Reset Handler
  const handleResetSystemKeys = async () => {
    const res = await authFetch(apiUrl("/api/system/admin/reset-keys"), {
      method: "POST"
    });
    const json = await res.json();
    if (res.ok) {
      toast({ title: "System Keys Reset", description: json.message });
      fetchAdminReport();
    } else {
      toast({ title: "Reset Failed", description: json.error, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <Key className="w-6 h-6 text-primary" /> API Center & Provider Management
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Configure AI provider credentials, manage multi-provider routing, view live telemetry, and troubleshoot rate limits.
        </p>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="bg-secondary/60 border border-border p-1 w-full flex overflow-x-auto justify-start h-11 rounded-2xl">
          <TabsTrigger 
            value="user-keys" 
            className="rounded-xl text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs transition-all duration-200"
          >
            <Key className="w-3.5 h-3.5 mr-1.5" /> User API Keys ({userKeys.length})
          </TabsTrigger>

          <TabsTrigger 
            value="project-keys" 
            className="rounded-xl text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs transition-all duration-200"
          >
            <Bot className="w-3.5 h-3.5 mr-1.5" /> Project Credentials
          </TabsTrigger>

          <TabsTrigger 
            value="guides" 
            className="rounded-xl text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs transition-all duration-200"
          >
            <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Setup Guides & Troubleshooting
          </TabsTrigger>

          {isAdmin && (
            <TabsTrigger 
              value="admin-health" 
              className="rounded-xl text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs transition-all duration-200"
            >
              <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-amber-500" /> System Health (Admin)
            </TabsTrigger>
          )}
        </TabsList>

        {/* Tab 1: User API Keys */}
        <TabsContent value="user-keys" className="mt-0">
          <UserApiKeysTab
            keys={userKeys}
            apiMode={apiMode}
            loading={loadingUserKeys}
            onAddKey={handleAddUserKey}
            onDeleteKey={handleDeleteUserKey}
            onVerifyKey={handleVerifyUserKey}
            onToggleEnabled={handleToggleUserEnabled}
            onSetPrimary={handleSetPrimaryUserKey}
            onClearCooldown={handleClearUserCooldown}
            onReplaceKey={handleReplaceUserKey}
            onModeChange={handleModeChange}
            onValidateKey={handleValidateKey}
          />
        </TabsContent>

        {/* Tab 2: Project Credentials */}
        <TabsContent value="project-keys" className="mt-0">
          <ProjectApiKeysTab
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            keys={projectKeys}
            loading={loadingProjectKeys}
            onAddKey={handleAddProjectKey}
            onDeleteKey={handleDeleteProjectKey}
            onVerifyKey={handleVerifyProjectKey}
            onUpdateModel={handleUpdateProjectModel}
            onToggleEnabled={handleToggleProjectEnabled}
            onSetPrimary={handleSetPrimaryProjectKey}
            onClearCooldown={handleClearProjectCooldown}
            onReplaceKey={handleReplaceProjectKey}
          />
        </TabsContent>

        {/* Tab 3: Provider Setup Guides */}
        <TabsContent value="guides" className="mt-0">
          <ProviderGuides />
        </TabsContent>

        {/* Tab 4: Admin-Only System Provider Health */}
        {isAdmin && (
          <TabsContent value="admin-health" className="mt-0">
            <AdminSystemHealthTab
              reportData={adminReport}
              loading={loadingAdminReport}
              isAdmin={isAdmin}
              onRefresh={fetchAdminReport}
              onResetSystemKeys={handleResetSystemKeys}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
