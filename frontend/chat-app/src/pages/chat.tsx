import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { ChatArea } from "@/components/chat-area";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function ChatPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      {desktopSidebarOpen && (
        <Sidebar className="hidden md:flex w-[260px] flex-shrink-0" onDesktopClose={() => setDesktopSidebarOpen(false)} />
      )}
      
      {/* Mobile Sidebar Trigger & Drawer */}
      <div className="md:hidden absolute top-3 left-4 z-20">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground bg-background/80 backdrop-blur-md border border-border">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 border-r border-border w-[280px]">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex-1 relative flex overflow-hidden">
        {/* Desktop Sidebar Toggle Button (only when sidebar is closed) */}
        {!desktopSidebarOpen && (
        <div className="hidden md:block absolute top-3 left-4 z-20">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setDesktopSidebarOpen(true)}
            className="text-muted-foreground hover:text-foreground hover:bg-accent/50"
            title="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </Button>
        </div>
        )}
        
        <ChatArea />
      </div>
    </div>
  );
}
