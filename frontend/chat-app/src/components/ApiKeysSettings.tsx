import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { apiUrl } from "@/lib/api-url";
import { Trash2, Plus, Key, CheckCircle, XCircle, AlertCircle, PlayCircle, Star } from "lucide-react";

type ApiKey = {
  id: string;
  name: string;
  provider: string;
  maskedKey: string;
  isPrimary: boolean;
  isEnabled: boolean;
  status: string;
  lastSuccess: string | null;
  lastFailure: string | null;
  failureReason: string | null;
  cooldownRemaining: number;
  createdAt: string;
};

export function ApiKeysSettings() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newProvider, setNewProvider] = useState("gemini");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

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
    } catch (err) {
      console.error("Failed to fetch API key settings", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
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
        body: JSON.stringify({ name: newName, apiKey: newKey, provider: newProvider }),
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

  const handleAction = async (id: string, action: string, method: string = "PATCH") => {
    try {
      if (action === "test") setTestingId(id);
      const { data } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (data.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }
      const url = action === "delete" ? `/api/api-keys/${id}` : `/api/api-keys/${id}/${action}`;
      const res = await fetch(apiUrl(url), {
        method,
        headers,
      });
      if (res.ok) {
        fetchSettings();
      }
    } catch (err) {
      console.error(`Failed to execute ${action} on key`, err);
    } finally {
      if (action === "test") setTestingId(null);
    }
  };

  const getStatusIcon = (status: string, isEnabled: boolean) => {
    if (!isEnabled) return <div className="w-2 h-2 rounded-full bg-gray-500" title="Disabled" />;
    if (status === "HEALTHY") return <div className="w-2 h-2 rounded-full bg-green-500" title="Healthy" />;
    if (status === "COOLDOWN" || status === "QUOTA_EXCEEDED") return <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" title="Cooldown / Quota" />;
    return <div className="w-2 h-2 rounded-full bg-red-500" title="Invalid" />;
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground animate-pulse">Loading API Settings...</div>;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-medium border-b border-foreground/5 pb-2 text-foreground/80">Multi-Provider API Keys</h2>
      
      {/* Keys List */}
      <div className="p-4 rounded-xl bg-card/40 border border-foreground/5 backdrop-blur-md shadow-sm space-y-4">
        <div>
          <h3 className="font-medium">Your API Keys</h3>
          <p className="text-sm text-muted-foreground">Add up to 5 custom API keys. The system auto-rotates between healthy keys.</p>
        </div>

        {keys.length > 0 ? (
          <div className="space-y-2">
            {keys.map((key) => (
              <div key={key.id} className="flex flex-col gap-2 p-3 border border-foreground/5 rounded-lg bg-background/50 backdrop-blur-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-md"><Key size={16} /></div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{key.name}</p>
                        {key.isPrimary && <span title="Primary Key"><Star size={14} className="text-yellow-500 fill-yellow-500 shrink-0" /></span>}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono truncate">{key.maskedKey}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded-full text-xs font-medium whitespace-nowrap">
                      {getStatusIcon(key.status, key.isEnabled)}
                      {key.isEnabled ? key.status : "DISABLED"}
                    </div>
                    {key.cooldownRemaining > 0 && (
                      <span className="text-xs text-yellow-600 bg-yellow-500/10 px-2 py-1 rounded-full whitespace-nowrap">
                        {key.cooldownRemaining}m cooldown
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Actions row */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-2 pt-2 border-t border-border/50 gap-2">
                  <div className="text-xs text-muted-foreground break-all">
                    Provider: <span className="uppercase font-medium">{key.provider}</span>
                    {key.status !== "HEALTHY" && key.failureReason && <span className="text-red-500 ml-2" title={key.failureReason}>| Error: {key.failureReason.substring(0, 30)}...</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleAction(key.id, "primary")} className="p-1.5 text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10 rounded-md transition-colors" title="Set as Primary">
                      <Star size={14} />
                    </button>
                    <button onClick={() => handleAction(key.id, "test", "POST")} disabled={testingId === key.id} className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded-md transition-colors" title="Test Key">
                      <PlayCircle size={14} className={testingId === key.id ? "animate-spin" : ""} />
                    </button>
                    <button onClick={() => handleAction(key.id, key.isEnabled ? "disable" : "enable")} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title={key.isEnabled ? "Disable Key" : "Enable Key"}>
                      {key.isEnabled ? <XCircle size={14} /> : <CheckCircle size={14} />}
                    </button>
                    <button onClick={() => handleAction(key.id, "delete", "DELETE")} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors" title="Delete Key">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground italic px-2 py-4">No custom keys added. Using System fallback limits (20 req/day).</div>
        )}

        {/* Add Key Form */}
        {keys.length < 5 && (
          <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex flex-col md:flex-row gap-2 md:items-center">
              <select
                value={newProvider}
                onChange={(e) => setNewProvider(e.target.value)}
                className="w-full md:w-auto bg-background border border-border rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary h-[38px]"
              >
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="claude">Claude</option>
                <option value="groq">Groq</option>
              </select>
              <input
                type="text"
                placeholder="Key Name (Optional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full md:flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary h-[38px]"
              />
              <input
                type="text"
                placeholder="API Key (AIza... or sk-...)"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="w-full md:flex-[2] bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary h-[38px]"
              />
              <button 
                onClick={handleAddKey}
                disabled={adding || !newKey.trim()}
                className="w-full md:w-auto justify-center bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2 h-[38px]"
              >
                <Plus size={16} />
                {adding ? "Testing..." : "Add"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
