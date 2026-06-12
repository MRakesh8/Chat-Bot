import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { apiUrl } from "@/lib/api-url";
import { Trash2, Plus, Key } from "lucide-react";

type ApiKey = {
  id: string;
  keyName: string;
  apiKeyEnding: string;
  status: string;
  createdAt: string;
};

export function ApiKeysSettings() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [mode, setMode] = useState<string>("auto");
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

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
        setKeys(json.keys || []);
        setMode(json.mode || "auto");
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

  const handleModeChange = async (newMode: string) => {
    setMode(newMode);
    try {
      const { data } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (data.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }
      await fetch(apiUrl("/api/api-keys/settings"), {
        method: "PATCH",
        headers,
        body: JSON.stringify({ apiMode: newMode }),
      });
    } catch (err) {
      console.error("Failed to update mode", err);
    }
  };

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
        body: JSON.stringify({ keyName: newName, apiKey: newKey }),
      });
      if (res.ok) {
        setNewKey("");
        setNewName("");
        fetchSettings();
      } else {
        const json = await res.json();
        setError(json.error || "Failed to add key");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      const { data } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (data.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }
      const res = await fetch(apiUrl(`/api/api-keys/${id}`), {
        method: "DELETE",
        headers,
      });
      if (res.ok) {
        setKeys(keys.filter((k) => k.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete key", err);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground animate-pulse">Loading API Settings...</div>;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-medium border-b border-border pb-2">API Keys & Fallback Routing</h2>
      
      {/* Mode Selection */}
      <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between">
        <div>
          <h3 className="font-medium">Routing Mode</h3>
          <p className="text-sm text-muted-foreground">Choose how Aria prioritizes your custom keys vs system keys.</p>
        </div>
        <select 
          value={mode}
          onChange={(e) => handleModeChange(e.target.value)}
          className="bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="auto">Auto (Recommended)</option>
          <option value="user_first">User Keys First</option>
          <option value="system_first">System Keys First</option>
        </select>
      </div>

      {/* Keys List */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-4">
        <div>
          <h3 className="font-medium">Your Gemini API Keys</h3>
          <p className="text-sm text-muted-foreground">Add up to 3 custom API keys. They have no daily limit.</p>
        </div>

        {keys.length > 0 ? (
          <div className="space-y-2">
            {keys.map((key) => (
              <div key={key.id} className="flex items-center justify-between p-3 border border-border rounded-lg bg-background">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-md"><Key size={16} /></div>
                  <div>
                    <p className="text-sm font-medium">{key.keyName}</p>
                    <p className="text-xs text-muted-foreground font-mono">****{key.apiKeyEnding}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-xs px-2 py-1 rounded-full ${key.status === "healthy" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
                    {key.status === "healthy" ? "Healthy" : "Cooldown"}
                  </span>
                  <button 
                    onClick={() => handleDeleteKey(key.id)}
                    className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground italic px-2 py-4">No custom keys added. Using System limits (20 req/day).</div>
        )}

        {/* Add Key Form */}
        {keys.length < 3 && (
          <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Key Name (Optional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="text"
                placeholder="AIzaSy..."
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="flex-[2] bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button 
                onClick={handleAddKey}
                disabled={adding || !newKey.trim()}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Plus size={16} />
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
