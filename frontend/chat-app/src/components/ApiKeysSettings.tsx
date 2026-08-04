import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { apiUrl } from "@/lib/api-url";
import { Trash2, Plus, Key, CheckCircle, XCircle, AlertCircle, PlayCircle, Star, Activity, Clock, RefreshCw, BarChart3, Zap } from "lucide-react";

type ApiKey = {
  id: string;
  name: string;
  provider: string;
  maskedKey: string;
  isPrimary: boolean;
  isEnabled: boolean;
  status: string;
  healthScore: number;
  latencyMs: number;
  totalRequests: number;
  totalFailures: number;
  tokensToday: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  failureReason: string | null;
  cooldownUntil: string | null;
  createdAt: string;
  availableModels?: string[];
  model?: string;
};

export function ApiKeysSettings() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [apiMode, setApiMode] = useState<string>("auto");
  const [chatRetention, setChatRetention] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [expandedKeyId, setExpandedKeyId] = useState<string | null>(null);
  const [fallbackEnabled, setFallbackEnabled] = useState(() => {
    return localStorage.getItem("openrouter_fallback_enabled") !== "false";
  });
  const [fallbackKey, setFallbackKey] = useState(() => {
    return localStorage.getItem("openrouter_fallback_key") || "";
  });

  const fetchSettings = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (data.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }

      const res = await fetch(apiUrl("/api/api-keys"), { headers });
      if (res.ok) {
        const json = await res.json();
        setKeys(json || []);
      }

      const modeRes = await fetch(apiUrl("/api/api-keys/settings"), { headers });
      if (modeRes.ok) {
        const modeJson = await modeRes.json();
        if (modeJson.apiMode) setApiMode(modeJson.apiMode);
        if (modeJson.chatHistoryRetentionDays !== undefined) setChatRetention(modeJson.chatHistoryRetentionDays);
      }
    } catch (err) {
      console.error("Failed to fetch API key settings", err);
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = async (newMode: string) => {
    setApiMode(newMode);
    await updateSettings({ apiMode: newMode });
  };

  const handleRetentionChange = async (days: number) => {
    setChatRetention(days);
    await updateSettings({ chatHistoryRetentionDays: days });
  };

  const updateSettings = async (payload: any) => {
    try {
      const { data } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (data.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }
      await fetch(apiUrl("/api/api-keys/settings"), {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("Failed to update settings", err);
    }
  };

  useEffect(() => {
    fetchSettings();
    const interval = setInterval(fetchSettings, 30000); // Live status updates every 30s
    return () => clearInterval(interval);
  }, []);

  const handleAddKey = async () => {
    if (!newKey.trim()) return;
    setAdding(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (data.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }
      const res = await fetch(apiUrl("/api/api-keys"), {
        method: "POST",
        headers,
        body: JSON.stringify({ name: newName, apiKey: newKey }),
      });
      if (res.ok) {
        setNewKey("");
        setNewName("");
        fetchSettings();
      } else {
        const json = await res.json();
        setError(json.message || json.error || "Failed to add key");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setAdding(false);
    }
  };

  const handleAction = async (id: string, action: string, method: string = "PATCH", body?: any) => {
    try {
      if (action === "test" || action === "verify") setTestingId(id);
      const { data } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (data.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }
      let url = `/api/api-keys/${id}/${action}`;
      if (action === "delete" || action === "update") {
        url = `/api/api-keys/${id}`;
      }
      
      const res = await fetch(apiUrl(url), {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      if (res.ok) {
        fetchSettings();
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error(`Failed to execute ${action}:`, errorData);
      }
    } catch (err) {
      console.error(`Failed to execute ${action} on key`, err);
    } finally {
      if (action === "test" || action === "verify") setTestingId(null);
    }
  };

  const getStatusBadge = (status: string, isEnabled: boolean) => {
    if (!isEnabled) return <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-500/10 text-gray-500 rounded-full text-xs font-medium"><div className="w-2 h-2 rounded-full bg-gray-500" /> DISABLED</div>;
    if (status === "HEALTHY") return <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-green-600 rounded-full text-xs font-medium"><div className="w-2 h-2 rounded-full bg-green-500" /> HEALTHY</div>;
    if (["RATE_LIMIT", "TOKEN_LIMIT", "COOLDOWN"].includes(status)) return <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 text-yellow-600 rounded-full text-xs font-medium"><div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" /> {status.replace("_", " ")}</div>;
    if (status === "DAILY_QUOTA" || status === "MONTHLY_CREDIT") return <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-500/10 text-orange-600 rounded-full text-xs font-medium"><div className="w-2 h-2 rounded-full bg-orange-500" /> QUOTA EXHAUSTED</div>;
    if (status === "INVALID_MODEL") return <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 text-blue-600 rounded-full text-xs font-medium"><div className="w-2 h-2 rounded-full bg-blue-500" /> INVALID MODEL</div>;
    return <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 text-red-600 rounded-full text-xs font-medium"><div className="w-2 h-2 rounded-full bg-red-500" /> {status.replace("_", " ")}</div>;
  };

  const formatCooldown = (cooldownUntil: string | null) => {
    if (!cooldownUntil) return null;
    const diff = new Date(cooldownUntil).getTime() - Date.now();
    if (diff <= 0) return null;
    const mins = Math.ceil(diff / 60000);
    return `${mins}m cooldown`;
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground animate-pulse">Loading API Settings...</div>;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b border-foreground/5 pb-2">
        <h2 className="text-xl font-medium text-foreground/80 flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" /> Enterprise API Health
        </h2>
      </div>

      {/* Keys List */}
      <div className="space-y-4">
        {keys.length > 0 ? (
          <div className="grid gap-4">
            {keys.map((key) => {
              const cooldown = formatCooldown(key.cooldownUntil);
              const isExpanded = expandedKeyId === key.id;
              
              return (
                <div key={key.id} className="flex flex-col border border-foreground/10 rounded-xl bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {/* Top Bar: Name, Status, Primary */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-background border border-foreground/5 rounded-lg shadow-sm">
                        <Key className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{key.name || "Unnamed Key"}</h3>
                          {key.isPrimary && <Star size={14} className="text-yellow-500 fill-yellow-500" />}
                          <span className="text-xs uppercase px-2 py-0.5 bg-foreground/5 text-foreground/70 rounded font-medium tracking-wide">
                            {key.provider}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{key.maskedKey}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {getStatusBadge(key.status, key.isEnabled)}
                      {cooldown && (
                        <span className="text-xs font-medium text-yellow-600 bg-yellow-500/10 px-2 py-1 rounded-full flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {cooldown}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metrics Row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-foreground/5 border-t border-foreground/5 bg-background/50">
                    <div className="p-3 flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Health Score</span>
                      <div className="flex items-end gap-2">
                        <span className={`text-xl font-light ${key.healthScore >= 95 ? 'text-green-500' : key.healthScore >= 80 ? 'text-yellow-500' : 'text-red-500'}`}>
                          {key.healthScore ?? 100}
                        </span>
                        <span className="text-xs text-muted-foreground mb-1">/ 100</span>
                      </div>
                    </div>
                    <div className="p-3 flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Avg Latency</span>
                      <div className="flex items-end gap-2">
                        <span className="text-xl font-light text-foreground">{key.latencyMs ?? 0}</span>
                        <span className="text-xs text-muted-foreground mb-1">ms</span>
                      </div>
                    </div>
                    <div className="p-3 flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Success Rate</span>
                      <div className="flex items-end gap-2">
                        <span className="text-xl font-light text-foreground">
                          {key.totalRequests > 0 ? Math.round(((key.totalRequests - key.totalFailures) / key.totalRequests) * 100) : 100}%
                        </span>
                        <span className="text-xs text-muted-foreground mb-1">({key.totalRequests} reqs)</span>
                      </div>
                    </div>
                    <div className="p-3 flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Tokens Today</span>
                      <div className="flex items-end gap-2">
                        <span className="text-xl font-light text-foreground">{(key.tokensToday || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Diagnostics Toggle */}
                  <div className="p-3 border-t border-foreground/5 flex items-center justify-between bg-muted/10">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setExpandedKeyId(isExpanded ? null : key.id)}
                        className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 px-2 py-1 rounded hover:bg-primary/5 transition-colors"
                      >
                        <BarChart3 className="w-3 h-3" /> 
                        {isExpanded ? "Hide Diagnostics" : "View Diagnostics"}
                      </button>
                      
                      {key.status !== "HEALTHY" && key.failureReason && !isExpanded && (
                        <span className="text-xs text-red-500 ml-2 max-w-[200px] truncate" title={key.failureReason}>
                          Error: {key.failureReason}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => handleAction(key.id, "primary")} className="p-1.5 text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10 rounded-md transition-colors" title="Set as Primary">
                        <Star size={16} />
                      </button>
                      <button onClick={() => handleAction(key.id, "verify", "POST")} disabled={testingId === key.id} className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded-md transition-colors flex items-center gap-1" title="Active Health Check">
                        <RefreshCw size={14} className={testingId === key.id ? "animate-spin text-blue-500" : ""} />
                        <span className="text-xs hidden sm:inline-block">Check Health</span>
                      </button>
                      <button onClick={() => handleAction(key.id, key.isEnabled ? "disable" : "enable")} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title={key.isEnabled ? "Disable Key" : "Enable Key"}>
                        {key.isEnabled ? <XCircle size={16} /> : <CheckCircle size={16} />}
                      </button>
                      <button onClick={() => handleAction(key.id, "delete", "DELETE")} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors" title="Delete Key">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Diagnostics Panel */}
                  {isExpanded && (
                    <div className="p-4 bg-foreground/[0.02] border-t border-foreground/5 grid gap-4 md:grid-cols-2 text-sm">
                      <div className="space-y-3">
                        <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Configuration</h4>
                        <div className="grid grid-cols-3 gap-2 items-center">
                          <span className="text-muted-foreground">Default Model</span>
                          <div className="col-span-2 flex items-center gap-2">
                            <select 
                              value={key.model || ""} 
                              onChange={(e) => handleAction(key.id, "update", "PUT", { model: e.target.value })}
                              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 outline-none focus:border-primary"
                            >
                              <option value="" disabled>Select model</option>
                              {key.availableModels?.map((m: string) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-muted-foreground">Created</span>
                          <span className="col-span-2 font-mono text-xs">{new Date(key.createdAt).toLocaleString()}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-muted-foreground">Total Usage</span>
                          <span className="col-span-2 font-mono text-xs">{key.totalRequests} reqs / {key.totalFailures} fails</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Health Status</h4>
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-muted-foreground">Last Success</span>
                          <span className="col-span-2 font-mono text-xs text-green-500">{key.lastSuccess ? new Date(key.lastSuccess).toLocaleString() : "Never"}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-muted-foreground">Last Failure</span>
                          <span className="col-span-2 font-mono text-xs text-red-500">{key.lastFailure ? new Date(key.lastFailure).toLocaleString() : "Never"}</span>
                        </div>
                        {key.failureReason && (
                          <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-red-600 text-xs font-mono break-all">
                            {key.failureReason}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center rounded-xl border border-dashed border-foreground/20 text-muted-foreground">
            <Key className="w-8 h-8 mx-auto mb-3 opacity-20" />
            <p>No API keys configured.</p>
            <p className="text-sm mt-1">Add a key below to enable intelligent routing and health monitoring.</p>
          </div>
        )}

        {/* Add Key Form */}
        {keys.length < 10 && (
          <div className="p-4 rounded-xl border border-foreground/10 bg-card mt-6">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" /> Add New Provider
            </h3>
            {error && <div className="mb-3 p-2 bg-red-500/10 text-red-500 text-sm rounded border border-red-500/20 flex items-center gap-2"><AlertCircle size={14}/>{error}</div>}
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                placeholder="Key Name (e.g. Production OpenAI)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full md:w-1/3 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <input
                type="password"
                placeholder="Paste API Key (sk-...)"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="w-full md:flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
              />
              <button 
                onClick={handleAddKey}
                disabled={adding || !newKey.trim()}
                className="w-full md:w-auto justify-center bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {adding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {adding ? "Verifying..." : "Add Key"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" /> The provider and available models will be automatically detected.
            </p>
          </div>
        )}
      </div>

      {/* Global Routing Settings */}
      <div className="mt-8 pt-6 border-t border-border">
        <h3 className="font-medium mb-3">Routing Priority Mode</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button onClick={() => handleModeChange("auto")} className={`p-4 rounded-xl border text-left transition-all ${apiMode === "auto" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-foreground/10 hover:bg-foreground/5"}`}>
            <div className="font-medium text-sm text-foreground">Auto-Balancing</div>
            <div className="text-xs text-muted-foreground mt-1">Smart load balancing based on health and limits</div>
          </button>
          <button onClick={() => handleModeChange("user_first")} className={`p-4 rounded-xl border text-left transition-all ${apiMode === "user_first" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-foreground/10 hover:bg-foreground/5"}`}>
            <div className="font-medium text-sm text-foreground">Custom First</div>
            <div className="text-xs text-muted-foreground mt-1">Prioritize your personal API keys</div>
          </button>
          <button onClick={() => handleModeChange("system_first")} className={`p-4 rounded-xl border text-left transition-all ${apiMode === "system_first" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-foreground/10 hover:bg-foreground/5"}`}>
            <div className="font-medium text-sm text-foreground">System First</div>
            <div className="text-xs text-muted-foreground mt-1">Prioritize system default keys</div>
          </button>
        </div>
      </div>

      {/* OpenRouter Fallback Settings */}
      <div className="mt-8 pt-6 border-t border-border">
        <h3 className="font-medium mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary animate-pulse" /> OpenRouter Backup Fallback
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Automatically switch to OpenRouter's free models if your Gemini API keys run out of quota or get rate-limited.
        </p>
        
        <div className="space-y-4 max-w-xl">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50">
            <div>
              <div className="text-sm font-medium">Enable Automatic Backup</div>
              <div className="text-xs text-muted-foreground mt-0.5">Use OpenRouter free models as a fallback if Gemini fails</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={fallbackEnabled} 
                onChange={(e) => {
                  setFallbackEnabled(e.target.checked);
                  localStorage.setItem("openrouter_fallback_enabled", String(e.target.checked));
                }}
                className="sr-only peer" 
              />
              <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {fallbackEnabled && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Custom OpenRouter API Key (Optional)</label>
              <input
                type="password"
                placeholder="Leave blank to use system default key (sk-or-...)"
                value={fallbackKey}
                onChange={(e) => {
                  setFallbackKey(e.target.value);
                  localStorage.setItem("openrouter_fallback_key", e.target.value);
                }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
