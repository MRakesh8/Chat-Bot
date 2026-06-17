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

      <main className="flex-1 relative z-10 overflow-y-auto h-full flex">
        <div className="flex-1 overflow-y-auto h-full relative">
          {children}
        </div>
        
        {/* Right Sidebar for Projects (Desktop only) */}
        <div className="hidden xl:flex w-[280px] flex-shrink-0 border-l border-border bg-sidebar flex-col h-full z-20">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Projects</h2>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Menu className="h-3 w-3" />
            </Button>
          </div>
          <div className="p-4 space-y-3 overflow-y-auto flex-1">
            <Button className="w-full justify-start border border-dashed border-border bg-transparent text-foreground hover:bg-accent h-12 rounded-xl">
              <span className="font-medium text-sm">New Project</span>
            </Button>
            
            {/* Example project cards matching the screenshot style */}
            <div className="border border-border rounded-xl p-3 bg-card hover:bg-accent transition-colors cursor-pointer">
              <h3 className="text-sm font-medium text-foreground">Learning From 100 Years...</h3>
              <p className="text-xs text-muted-foreground mt-1 truncate">For athletes, high altitude prod...</p>
            </div>
            
            <div className="border border-border rounded-xl p-3 bg-card hover:bg-accent transition-colors cursor-pointer">
              <h3 className="text-sm font-medium text-foreground">Research officiants</h3>
              <p className="text-xs text-muted-foreground mt-1 truncate">Maxwell's equations - the foun...</p>
            </div>
            
            <div className="border border-border rounded-xl p-3 bg-card hover:bg-accent transition-colors cursor-pointer">
              <h3 className="text-sm font-medium text-foreground">What does a senior lead do...</h3>
              <p className="text-xs text-muted-foreground mt-1 truncate">Physiological respiration involv...</p>
            </div>
            
            <div className="border border-border rounded-xl p-3 bg-card hover:bg-accent transition-colors cursor-pointer">
              <h3 className="text-sm font-medium text-foreground">Write a sweet note to your...</h3>
              <p className="text-xs text-muted-foreground mt-1 truncate">In the eighteenth century the G...</p>
            </div>
            
            <div className="border border-border rounded-xl p-3 bg-card hover:bg-accent transition-colors cursor-pointer">
              <h3 className="text-sm font-medium text-foreground">Meet with cake bakers</h3>
              <p className="text-xs text-muted-foreground mt-1 truncate">Physical space is often conceiv...</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
