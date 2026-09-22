import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  ChevronDown,
  Building2,
} from "lucide-react";

export function TopNav({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const [location, setLocation] = useLocation();
  const { user, dbUser, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  const getPageTitle = () => {
    if (location === "/" || location.startsWith("/chat")) return "Chat Workspace";
    if (location.startsWith("/projects/new")) return "New Project";
    if (location.startsWith("/projects/") && location.endsWith("/edit")) return "Project Settings";
    if (location.startsWith("/projects")) return "Projects";
    if (location.startsWith("/services")) return "Connected Services";
    if (location.startsWith("/billing")) return "Billing & Plan";
    if (location.startsWith("/settings")) return "Settings";
    if (location.startsWith("/profile")) return "Profile";
    if (location.startsWith("/admin")) return "Admin Console";
    return "NOVA Workspace";
  };

  const displayName = user?.email?.split("@")[0] || "User";

  return (
    <header className="h-16 w-full border-b border-border/80 bg-background/95 backdrop-blur-md px-4 md:px-6 flex items-center justify-between z-20 shrink-0">
      {/* Left: Page Title & Context */}
      <div className="flex items-center gap-3 pl-10 md:pl-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Sparkles className="w-4 h-4" />
          </div>
          <h1 className="text-base font-semibold text-foreground tracking-tight">
            {getPageTitle()}
          </h1>
        </div>

        <span className="hidden sm:inline-block text-border">/</span>

        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium border border-border">
          <Building2 className="w-3.5 h-3.5 text-primary" />
          <span>NOVA Business AI</span>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        {/* Quick Search */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSearch}
          className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 border-border hover:bg-secondary hover:text-foreground h-9 px-3 rounded-xl transition-all"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search or command...</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/settings?tab=notifications")}
          className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary relative"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
        </Button>

        {/* User Account Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 pl-2 pr-1 h-9 rounded-xl hover:bg-secondary transition-all border border-transparent hover:border-border"
            >
              <Avatar className="h-7 w-7 border border-border">
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {displayName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium text-foreground max-w-[100px] truncate hidden md:inline-block">
                {displayName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5 shadow-lg bg-popover border-border">
            <DropdownMenuLabel className="font-normal px-2 py-1.5">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLocation("/profile")} className="cursor-pointer rounded-xl text-xs py-2">
              Profile & Account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/billing")} className="cursor-pointer rounded-xl text-xs py-2">
              Billing & Subscription
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation("/settings")} className="cursor-pointer rounded-xl text-xs py-2">
              Workspace Settings
            </DropdownMenuItem>
            {dbUser?.role === "super_admin" && (
              <DropdownMenuItem onClick={() => setLocation("/admin/clarity")} className="cursor-pointer rounded-xl text-xs py-2 text-primary font-medium">
                Super Admin Console
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer rounded-xl text-xs py-2 text-destructive focus:bg-destructive/10 focus:text-destructive">
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
