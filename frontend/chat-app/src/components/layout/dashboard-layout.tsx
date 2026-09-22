import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const { elementRef, handleScroll } = useScrollRestoration<HTMLElement>();

  const handleToggle = () => {
    const isDesktop = window.innerWidth >= 768;
    if (isDesktop) {
      setDesktopSidebarOpen(!desktopSidebarOpen);
    } else {
      setMobileOpen(!mobileOpen);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background relative text-foreground">
      {/* Soft Ambient Light Glows */}
      <div className="absolute top-[-5%] left-[-5%] w-[35vw] h-[35vw] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-5%] right-[-5%] w-[35vw] h-[35vw] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Desktop Sidebar */}
      {desktopSidebarOpen && (
        <Sidebar
          className="hidden md:flex relative z-20 w-[260px] flex-shrink-0"
          onDesktopClose={() => handleToggle()}
        />
      )}

      {/* Mobile Drawer & Sidebar Trigger */}
      <div className="absolute top-3.5 left-3 z-30">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          {!desktopSidebarOpen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggle}
              onKeyDown={handleKeyDown}
              aria-label="Toggle Sidebar"
              className="hidden md:flex text-muted-foreground hover:text-foreground bg-card/80 backdrop-blur-md border border-border h-9 w-9 rounded-xl shadow-xs"
            >
              <Menu className="w-4 h-4" />
            </Button>
          )}

          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle Sidebar"
              className="md:hidden text-muted-foreground hover:text-foreground bg-card/80 backdrop-blur-md border border-border h-9 w-9 rounded-xl shadow-xs"
            >
              <Menu className="w-4 h-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 border-r border-border w-[280px]">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative z-10">
        <TopNav onOpenSearch={() => {
          const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
          window.dispatchEvent(event);
        }} />
        <main
          ref={elementRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto h-full"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
