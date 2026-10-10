import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { apiUrl } from "@/lib/api-url";
import { useTheme } from "@/contexts/ThemeContext";
import { ApiKeysSettings } from "@/components/ApiKeysSettings";
import { BillingSection } from "@/components/project/billing-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettingsTabPrefetch } from "@/hooks/use-tab-prefetch";
import { Palette, Globe, Mic, Lock, CreditCard, Key, Settings } from "lucide-react";

type Project = {
  id: string;
  name: string;
  isActive: boolean;
};

export default function SettingsPage() {
  const { palette, setPalette, mode, setMode, theme, setTheme } = useTheme();
  const [, setLocation] = useLocation();
  const authFetch = useAuthFetch();

  const getUrlParams = () => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      return {
        tab: searchParams.get("tab") || "general",
        projectId: searchParams.get("projectId") || null,
      };
    }
    return { tab: "general", projectId: null };
  };

  const initialParams = getUrlParams();
  const [activeTab, setActiveTab] = useState(
    initialParams.tab === "notifications" ? "general" : initialParams.tab
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialParams.projectId);

  useEffect(() => {
    const { tab, projectId } = getUrlParams();
    if (tab === "notifications") {
      setLocation(projectId ? `/notifications?projectId=${projectId}` : "/notifications", { replace: true });
      return;
    }
    if (tab) setActiveTab(tab);
    if (projectId) setSelectedProjectId(projectId);
  }, [setLocation]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url.toString());
    }
  };

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/projects"));
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json() as Promise<Project[]>;
    },
    staleTime: 30000,
  });

  const effectiveProjectId = selectedProjectId || (projects && projects.length > 0 ? projects[0].id : null);
  const { getTabTriggerProps } = useSettingsTabPrefetch(effectiveProjectId, activeTab);

  return (
    <div className="flex w-full h-full bg-transparent overflow-x-hidden">
      <div className="flex-1 p-6 md:p-8 text-foreground max-w-4xl mx-auto space-y-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs px-2.5 py-0.5 rounded-full font-semibold">
              Global Account Scope
            </Badge>
          </div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">Workspace Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure global account appearance, billing subscriptions, and workspace-wide API keys.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="mb-8 bg-card border border-border p-1.5 w-full flex overflow-x-auto justify-start h-12 rounded-2xl shadow-xs no-scrollbar scroll-smooth">
            <TabsTrigger value="general" {...getTabTriggerProps("general")} className="shrink-0 flex-1 min-w-[120px] rounded-xl font-semibold text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
              <Settings className="w-4 h-4 mr-2" /> General
            </TabsTrigger>
            <TabsTrigger value="billing" {...getTabTriggerProps("billing")} className="shrink-0 flex-1 min-w-[120px] rounded-xl font-semibold text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
              <CreditCard className="w-4 h-4 mr-2" /> Billing
            </TabsTrigger>
            <TabsTrigger value="api-keys" {...getTabTriggerProps("api-keys")} className="shrink-0 flex-1 min-w-[120px] rounded-xl font-semibold text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
              <Key className="w-4 h-4 mr-2" /> API Keys
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-8 mt-0">
            {/* Appearance & Named Palettes */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3">
                <Palette className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground font-serif">Appearance & Theme Palettes</h2>
              </div>
              
              {/* Palette Cards */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Select Color Palette
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Palette 1: Warm Paper */}
                  <button
                    type="button"
                    onClick={() => setPalette("warm-paper")}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                      palette === "warm-paper"
                        ? "bg-card border-primary ring-2 ring-primary/30 shadow-xs"
                        : "bg-card/50 border-border hover:border-primary/40"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-foreground">Warm Paper</span>
                        {palette === "warm-paper" && (
                          <span className="text-[10px] font-semibold bg-primary/15 text-primary px-2 py-0.5 rounded-full">Active</span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground mt-0.5 block">Standalone Cream, Coral & Emerald identity</span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="w-4 h-4 rounded-full bg-[#FBF6EE] border border-border" title="Cream" />
                      <span className="w-4 h-4 rounded-full bg-[#FF6A3D]" title="Coral" />
                      <span className="w-4 h-4 rounded-full bg-[#1F6F5C]" title="Emerald" />
                    </div>
                  </button>

                  {/* Palette 2: NOVA Natural */}
                  <button
                    type="button"
                    onClick={() => setPalette("nova-natural")}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                      palette === "nova-natural"
                        ? "bg-card border-primary ring-2 ring-primary/30 shadow-xs"
                        : "bg-card/50 border-border hover:border-primary/40"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-foreground">NOVA Natural</span>
                        {palette === "nova-natural" && (
                          <span className="text-[10px] font-semibold bg-primary/15 text-primary px-2 py-0.5 rounded-full">Active</span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground mt-0.5 block">Warm Paper surface, Forest Ink, Coral CTA & Teal accent</span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="w-4 h-4 rounded-full bg-[#F6F5EF] border border-border" title="Warm Neutral" />
                      <span className="w-4 h-4 rounded-full bg-[#20312C]" title="Forest Ink" />
                      <span className="w-4 h-4 rounded-full bg-[#C95738]" title="Coral CTA" />
                      <span className="w-4 h-4 rounded-full bg-[#16796F]" title="Deep Teal" />
                    </div>
                  </button>
                </div>
              </div>

              {/* Mode Control */}
              <div className="p-5 rounded-2xl bg-card border border-border shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Appearance Mode</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Switch between Light, Dark, or automatic System mode.</p>
                </div>
                <div className="flex items-center gap-1.5 bg-secondary/60 p-1 rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setMode("light")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      mode === "light" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("dark")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      mode === "dark" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Dark
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("system")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      mode === "system" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    System
                  </button>
                </div>
              </div>
            </section>

            {/* Language & Voice */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3">
                <Globe className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground">Language & Voice</h2>
              </div>

              <div className="p-5 rounded-2xl bg-card border border-border shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-medium text-base text-foreground">Default Language</h3>
                  <p className="text-xs text-muted-foreground mt-1">Select the primary interface and response language.</p>
                </div>
                <select 
                  defaultValue="English"
                  className="w-full sm:w-auto bg-secondary border border-border rounded-xl px-4 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 hover:bg-secondary/80 transition-colors cursor-pointer"
                >
                  <option value="English">English (US)</option>
                  <option value="Tamil">Tamil (IN)</option>
                </select>
              </div>

              {/* Coming Soon Voice Mode */}
              <div className="p-5 rounded-2xl bg-muted/40 border border-border/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-medium text-base text-muted-foreground">Voice Mode</h3>
                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20 gap-1 px-2 py-0.5 rounded-full font-semibold">
                      <Lock className="w-3 h-3" /> Coming Soon
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground/80">Choose NOVA AI's spoken voice and speech synthesis parameters.</p>
                </div>
                <Button disabled variant="outline" size="sm" className="w-full sm:w-auto opacity-50 cursor-not-allowed text-xs rounded-xl">
                  Unavailable
                </Button>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="billing" className="mt-0">
            <BillingSection />
          </TabsContent>

          <TabsContent value="api-keys" className="mt-0">
            <ApiKeysSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
