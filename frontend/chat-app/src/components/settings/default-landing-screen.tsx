import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Compass,
  FolderKanban,
  MessageSquare,
  Globe,
  Bot,
  Key,
  Bell,
  CreditCard,
  Settings as SettingsIcon,
  User,
  Shield,
  Check,
  ExternalLink,
  Sparkles,
  Loader2,
  RotateCcw,
} from "lucide-react";

export type ScreenOption = {
  id: string;
  name: string;
  path: string;
  badge?: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

export const AVAILABLE_SCREENS: ScreenOption[] = [
  {
    id: "projects",
    name: "Projects Workspace",
    path: "/projects",
    badge: "Default",
    description: "Overview of your chatbots, knowledge bases, website crawlers, widget deployments, and data sources.",
    icon: FolderKanban,
  },
  {
    id: "chat",
    name: "NOVA Chat / AI Assistant",
    path: "/chat",
    badge: "Conversational",
    description: "Direct access to AI multi-turn chat grounded in your business documents, files, and web knowledge.",
    icon: MessageSquare,
  },
  {
    id: "services",
    name: "Connected Services",
    path: "/services",
    badge: "Integrations",
    description: "Live management for WhatsApp handoff, webhook event triggers, and third-party tools.",
    icon: Globe,
  },
  {
    id: "agent-control",
    name: "Agent Control Center",
    path: "/agent-control",
    badge: "Autonomous",
    description: "Monitor automated background agent executions, tool telemetry, and manual approval gates.",
    icon: Bot,
  },
  {
    id: "api-center",
    name: "API Center",
    path: "/api-center",
    badge: "Developer",
    description: "Manage project API keys, model provider setups (Gemini, Claude, OpenAI), and endpoints.",
    icon: Key,
  },
  {
    id: "notifications",
    name: "Notifications & Alerts",
    path: "/notifications",
    badge: "Activity",
    description: "Track customer conversation alerts, unresolved knowledge gaps, and system events.",
    icon: Bell,
  },
  {
    id: "billing",
    name: "Billing & Plans",
    path: "/billing",
    badge: "Account",
    description: "Review current subscription status, feature entitlements, and invoice billing records.",
    icon: CreditCard,
  },
  {
    id: "settings",
    name: "Workspace Settings",
    path: "/settings",
    badge: "Configuration",
    description: "Open directly into workspace theme appearance, language preferences, and keys.",
    icon: SettingsIcon,
  },
  {
    id: "profile",
    name: "Profile & Identity",
    path: "/profile",
    badge: "Personal",
    description: "Manage your user identity, contact email, organization memberships, and role.",
    icon: User,
  },
  {
    id: "admin",
    name: "Admin Console",
    path: "/admin/clarity",
    badge: "Super Admin",
    adminOnly: true,
    description: "System telemetry, tenant analytics, error observability, and platform key pools.",
    icon: Shield,
  },
];

export function DefaultLandingScreenSection() {
  const { dbUser, defaultLandingScreen, setDefaultLandingScreen } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const screens = AVAILABLE_SCREENS.filter(
    (s) => !s.adminOnly || dbUser?.role === "super_admin"
  );

  const isKnown = screens.some((s) => s.path === defaultLandingScreen);
  const currentPath = isKnown ? defaultLandingScreen : "/projects";
  const activeOption = screens.find((s) => s.path === currentPath) || screens[0];
  const ActiveIcon = activeOption.icon;

  const handleSelectScreen = async (path: string) => {
    if (path === currentPath && !isSaving) return;
    setIsSaving(true);
    const chosen = screens.find((s) => s.path === path);

    const success = await setDefaultLandingScreen(path);
    setIsSaving(false);

    if (success) {
      toast({
        title: "Default Landing Screen Saved",
        description: `Whenever you log in or open the website, ${chosen?.name || path} will now open automatically.`,
      });
    } else {
      toast({
        title: "Saved Locally",
        description: `Default screen set to ${chosen?.name || path}. Offline preference updated.`,
      });
    }
  };

  const handleResetToDefault = async () => {
    await handleSelectScreen("/projects");
  };

  return (
    <section className="space-y-5" aria-labelledby="landing-screen-heading" data-testid="default-landing-screen-section">
      {/* ── Section Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0 shadow-2xs">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h2 id="landing-screen-heading" className="text-xl font-semibold text-foreground font-serif">
              Default Landing Screen
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Customize which screen opens automatically each time you open the website or log in.
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="bg-primary/10 text-primary border-primary/25 text-xs px-2.5 py-0.5 rounded-full font-semibold self-start sm:self-auto shrink-0"
        >
          Startup Preference
        </Badge>
      </div>

      {/* ── Active Screen Hero Card ── */}
      <div data-testid="active-landing-screen-hero" className="p-4 sm:p-5 rounded-2xl bg-card border border-border/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center gap-3.5 min-w-0 z-10">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0 shadow-xs">
            <ActiveIcon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Active Default Screen
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                <Check className="w-3 h-3 stroke-[2.5]" />
                Auto-opens on login
              </span>
            </div>
            <p className="text-base font-bold text-foreground mt-0.5 truncate">
              {activeOption.name}{" "}
              <span className="font-mono text-xs font-normal text-muted-foreground ml-1">
                ({activeOption.path})
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto shrink-0 z-10">
          {currentPath !== "/projects" && (
            <Button
              type="button"
              data-testid="reset-default-screen-btn"
              variant="ghost"
              size="sm"
              onClick={handleResetToDefault}
              disabled={isSaving}
              className="h-9 px-3 text-xs rounded-xl gap-1.5 text-muted-foreground hover:text-foreground"
              title="Reset default screen back to Projects"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Projects</span>
            </Button>
          )}

          <Button
            type="button"
            data-testid="open-screen-now-btn"
            variant="outline"
            size="sm"
            onClick={() => setLocation(activeOption.path)}
            className="h-9 px-4 text-xs font-semibold rounded-xl gap-2 w-full md:w-auto hover:bg-primary hover:text-primary-foreground border-border/80 shadow-2xs transition-all"
            title="Navigate to this screen right now"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Screen Now</span>
          </Button>
        </div>
      </div>

      {/* ── Screen Options Grid ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Available Screens ({screens.length})
          </label>
          <span className="text-[11px] text-muted-foreground font-medium">
            Select one to update your startup default
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {screens.map((opt) => {
            const isSelected = currentPath === opt.path;
            const Icon = opt.icon;

            return (
              <button
                key={opt.id}
                data-testid={`landing-screen-option-${opt.id}`}
                type="button"
                onClick={() => handleSelectScreen(opt.path)}
                disabled={isSaving}
                className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 group relative ${
                  isSelected
                    ? "bg-card border-primary ring-2 ring-primary/30 shadow-xs"
                    : "bg-card/50 border-border hover:border-primary/40 hover:bg-card/80"
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "bg-secondary/80 text-foreground group-hover:text-primary group-hover:bg-primary/10"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-sm text-foreground truncate">
                          {opt.name}
                        </span>
                        {opt.badge && (
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              opt.badge === "Default"
                                ? "bg-primary/15 text-primary border border-primary/20"
                                : opt.badge === "Super Admin"
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                : "bg-secondary text-muted-foreground border border-border"
                            }`}
                          >
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground block mt-0.5">
                        {opt.path}
                      </span>
                    </div>
                  </div>

                  {/* Radio Indicator */}
                  <div className="shrink-0 pt-0.5">
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground shadow-2xs"
                          : "border-border/80 group-hover:border-primary/60 bg-transparent"
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Informational Sync Footer ── */}
      <div className="p-3.5 rounded-2xl bg-secondary/30 border border-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span>
            Your landing screen selection is linked to your account. Whenever you sign in on any device, this screen will load automatically.
          </span>
        </div>

        {isSaving && (
          <div className="flex items-center gap-1.5 text-primary font-medium shrink-0">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Saving preference...</span>
          </div>
        )}
      </div>
    </section>
  );
}
