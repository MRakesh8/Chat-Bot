import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);

  const handleToggle = () => {
    const isDesktop = window.innerWidth >= 768; // md breakpoint in tailwind is 768px
    if (isDesktop) {
      const newState = !desktopSidebarOpen;
      console.log(`SIDEBAR_TOGGLE_CLICK\nPrevious State: ${desktopSidebarOpen ? 'Open' : 'Collapsed'}\nNew State: ${newState ? 'Open' : 'Collapsed'}`);
      setDesktopSidebarOpen(newState);
    } else {
      const newState = !mobileOpen;
      console.log(`SIDEBAR_TOGGLE_CLICK\nPrevious State: ${mobileOpen ? 'Open' : 'Collapsed'}\nNew State: ${newState ? 'Open' : 'Collapsed'}`);
      setMobileOpen(newState);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background relative">
      <div className="absolute top-[-10%] left-[-5%] w-[35%] h-[35%] bg-primary/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[35%] h-[35%] bg-blue-500/15 rounded-full blur-[100px] pointer-events-none" />

      {desktopSidebarOpen && (
        <Sidebar className="hidden md:flex relative z-20 w-[260px] flex-shrink-0" onDesktopClose={() => handleToggle()} />
      )}
      
      {/* Global Sidebar Toggle Button for Desktop (when collapsed) and Mobile */}
      <div className="absolute top-3 left-4 z-30">
        <Sheet open={mobileOpen} onOpenChange={(open) => {
          console.log(`SIDEBAR_TOGGLE_CLICK\nPrevious State: ${mobileOpen ? 'Open' : 'Collapsed'}\nNew State: ${open ? 'Open' : 'Collapsed'}`);
          setMobileOpen(open);
        }}>
          {!desktopSidebarOpen && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleToggle}
              onKeyDown={handleKeyDown}
              aria-label="Toggle Sidebar"
              className="hidden md:flex text-muted-foreground hover:text-foreground bg-background/80 backdrop-blur-md border border-border"
            >
              <Menu className="w-5 h-5" />
            </Button>
          )}
          
          <SheetTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              aria-label="Toggle Sidebar"
              onClick={() => {
                // Let SheetTrigger handle mobile open automatically, just log it if we want,
                // but actually Sheet onOpenChange handles the logging.
              }}
              className="md:hidden text-muted-foreground hover:text-foreground bg-background/80 backdrop-blur-md border border-border"
            >
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 border-r border-border w-[280px]">
            <Sidebar onClose={() => {
              console.log(`SIDEBAR_TOGGLE_CLICK\nPrevious State: Open\nNew State: Collapsed`);
              setMobileOpen(false);
            }} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex-1 relative z-10 overflow-y-auto w-full h-full">
        {children}
      </div>
    </div>
  );
}
