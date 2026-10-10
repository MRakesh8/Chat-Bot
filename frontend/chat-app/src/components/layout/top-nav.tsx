import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell,
  Sun,
  Moon,
  Search,
  Sparkles,
  Building2,
  User,
  CreditCard,
  Settings,
  Shield,
  LogOut,
  CheckCircle2,
} from "lucide-react";
import { apiUrl } from "@/lib/api-url";
import { useAuthFetch } from "@/hooks/use-auth-fetch";

import { useNovaAi } from "@/contexts/NovaAiContext";

export function TopNav({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const [location, setLocation] = useLocation();
  const { user, dbUser, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toggleOpen } = useNovaAi();
  const authFetch = useAuthFetch();

  // Extract project ID if present in URL
  const projectMatch = location.match(/\/projects\/([^\/]+)/);
  const projectId = projectMatch && projectMatch[1] !== "new" ? projectMatch[1] : null;

  const { data: project } = useQuery({
    queryKey: ["top-nav-project", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await authFetch(apiUrl(`/api/projects/${projectId}`));
      if (!res.ok) return null;
      return res.json() as Promise<{ id: string; name: string; isActive: boolean }>;
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5,
  });

  const { data: unreadSummary } = useQuery({
    queryKey: ["top-nav-unread-summary", projectId],
    queryFn: async () => {
      try {
        if (projectId) {
          const res = await authFetch(apiUrl(`/api/projects/${projectId}/notifications/unread-count`));
          if (res.ok) {
            const data = await res.json();
            return { totalUnread: Number(data.unreadCount || 0) };
          }
        } else {
          const res = await authFetch(apiUrl(`/api/notifications/unread-summary`));
          if (res.ok) {
            const data = await res.json();
            return { totalUnread: Number(data.totalUnread || 0) };
          }
        }
      } catch {
        // Safe fallback
      }
      return { totalUnread: 0 };
    },
    enabled: !!user,
    refetchInterval: 20000,
  });

  const unreadCount = unreadSummary?.totalUnread || 0;

  const getPageTitle = () => {
    if (location === "/" || location.startsWith("/chat")) return "Chat Workspace";
    if (location.startsWith("/projects/new")) return "New Project";
    if (location.startsWith("/projects/") && location.endsWith("/edit")) return project?.name || "Project Settings";
    if (location.startsWith("/projects")) return "Projects";
    if (location.startsWith("/services")) return "Connected Services";
    if (location.startsWith("/billing")) return "Billing & Plan";
    if (location.startsWith("/notifications")) return "Notifications";
    if (location.startsWith("/settings")) return "Settings";
    if (location.startsWith("/profile")) return "Profile";
    if (location.startsWith("/admin")) return "Admin Console";
    return "NOVA Workspace";
  };

  const rawName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  return (
    <header className="h-16 w-full border-b border-border/80 bg-background/95 backdrop-blur-md px-4 md:px-6 flex items-center justify-between z-20 shrink-0">
      {/* Left: Page Title & Context */}
      <div className="flex items-center gap-3 pl-10 md:pl-0 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Sparkles className="w-4 h-4" />
          </div>
          <h1 className="text-sm md:text-base font-semibold text-foreground tracking-tight truncate max-w-[160px] sm:max-w-[240px]">
            {getPageTitle()}
          </h1>
        </div>

        <span className="hidden sm:inline-block text-border/80">/</span>

        {/* Compact Workspace / Project context indicator */}
        <div className="hidden sm:flex items-center gap-2">
          {project ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/30 shadow-2xs">
              <Building2 className="w-3.5 h-3.5 text-primary" />
              <span className="truncate max-w-[140px]" title={project.name}>{project.name}</span>
              <span className="text-[10px] font-normal uppercase text-primary/70 tracking-wider bg-primary/20 px-1.5 py-0.2 rounded-full">Project</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/80 text-secondary-foreground text-xs font-medium border border-border/60 shadow-2xs">
              <Building2 className="w-3.5 h-3.5 text-primary" />
              <span className="truncate max-w-[140px]">NOVA Business AI</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider bg-background px-1.5 py-0.2 rounded-full border border-border/40">Account</span>
            </div>
          )}

          {project && (
            <Badge variant="outline" className="hidden lg:flex items-center gap-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[11px] px-2 py-0.5 rounded-full font-medium">
              <CheckCircle2 className="w-3 h-3" />
              <span>Website analyzed</span>
            </Badge>
          )}
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Quick Search */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSearch}
          aria-label="Open search or command palette"
          className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 border-border/60 hover:bg-secondary hover:text-foreground h-9 px-3 rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search or command...</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border/80 bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:ring-2 focus-visible:ring-primary/50"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
        </Button>

        {/* ✨ NOVA AI Floating Launcher */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleOpen}
          aria-label="Open NOVA AI Assistant"
          className="relative flex items-center gap-1.5 text-xs font-semibold bg-gradient-to-r from-violet-500/10 via-primary/10 to-indigo-500/10 border-primary/30 hover:border-primary text-foreground hover:text-primary h-9 px-3 rounded-xl transition-all shadow-xs group overflow-hidden focus-visible:ring-2 focus-visible:ring-primary/50"
          title="Open ✨ NOVA AI Floating Assistant"
        >
          <Sparkles className="w-3.5 h-3.5 text-violet-500 animate-pulse shrink-0" />
          <span className="font-bold tracking-tight">✨ NOVA AI</span>
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          onClick={() => {
            if (projectId) {
              setLocation(`/notifications?projectId=${projectId}`);
            } else {
              setLocation("/notifications");
            }
          }}
          className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary relative transition-colors focus-visible:ring-2 focus-visible:ring-primary/50"
          title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "Notifications"}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center animate-in zoom-in shadow-xs">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>

        {/* User Account Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              aria-label="User Menu"
              className="flex items-center gap-2 pl-1.5 pr-2.5 h-9 rounded-xl hover:bg-secondary transition-all border border-transparent hover:border-border/60 focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Avatar className="h-7 w-7 border border-border/80 shadow-2xs shrink-0">
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {displayName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium text-foreground max-w-[120px] truncate hidden md:inline-block">
                {displayName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-56 rounded-2xl p-1.5 shadow-xl bg-popover border-border z-50">
            <DropdownMenuLabel className="font-normal px-2.5 py-2">
              <div className="flex flex-col space-y-0.5">
                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-1 bg-border/60" />
            <DropdownMenuItem onClick={() => setLocation("/profile")} className="cursor-pointer rounded-xl text-xs py-2 hover:bg-accent focus:bg-accent flex items-center gap-2.5 transition-colors">
              <User className="w-4 h-4 text-primary shrink-0" />
              <span>Profile & Account</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/billing")} className="cursor-pointer rounded-xl text-xs py-2 hover:bg-accent focus:bg-accent flex items-center gap-2.5 transition-colors">
              <CreditCard className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Billing & Subscription</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/settings")} className="cursor-pointer rounded-xl text-xs py-2 hover:bg-accent focus:bg-accent flex items-center gap-2.5 transition-colors">
              <Settings className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Workspace Settings</span>
            </DropdownMenuItem>
            {dbUser?.role === "super_admin" && (
              <>
                <DropdownMenuSeparator className="my-1 bg-border/60" />
                <DropdownMenuItem onClick={() => setLocation("/admin/clarity")} className="cursor-pointer rounded-xl text-xs py-2 hover:bg-accent focus:bg-accent text-amber-500 font-medium flex items-center gap-2.5 transition-colors">
                  <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Admin Console</span>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator className="my-1 bg-border/60" />
            <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer rounded-xl text-xs py-2 text-rose-500 hover:bg-rose-500/10 focus:bg-rose-500/10 focus:text-rose-600 flex items-center gap-2.5 transition-colors font-medium">
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

