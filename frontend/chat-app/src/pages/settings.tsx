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
  const { theme, setTheme } = useTheme();
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Workspace Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure global account appearance, billing subscriptions, and workspace-wide API keys.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="mb-8 bg-white/[0.02] border border-white/[0.05] p-1.5 w-full flex overflow-x-auto justify-start h-12 rounded-2xl backdrop-blur-xl no-scrollbar scroll-smooth">
            <TabsTrigger value="general" {...getTabTriggerProps("general")} className="shrink-0 flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <Settings className="w-4 h-4 mr-2" /> General
            </TabsTrigger>
            <TabsTrigger value="billing" {...getTabTriggerProps("billing")} className="shrink-0 flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <CreditCard className="w-4 h-4 mr-2" /> Billing
            </TabsTrigger>
            <TabsTrigger value="api-keys" {...getTabTriggerProps("api-keys")} className="shrink-0 flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300">
              <Key className="w-4 h-4 mr-2" /> API Keys
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-8 mt-0">
            {/* Appearance */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3">
                <Palette className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground">Appearance</h2>
              </div>
              <div className="p-5 rounded-2xl bg-card border border-border shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-medium text-base text-foreground">Theme Mode</h3>
                  <p className="text-xs text-muted-foreground mt-1">Customize the visual theme of NOVA AI across sessions.</p>
                </div>
                <select 
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as any)}
                  className="w-full sm:w-auto bg-secondary border border-border rounded-xl px-4 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 hover:bg-secondary/80 transition-colors cursor-pointer"
                >
                  <option value="system">System Default</option>
                  <option value="dark">Dark Theme</option>
                  <option value="light">Light Theme</option>
                  <option value="evergreen">Evergreen Theme</option>
                </select>
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
