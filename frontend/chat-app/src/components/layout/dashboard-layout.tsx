import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background relative">
      <div className="absolute top-[-10%] left-[-5%] w-[35%] h-[35%] bg-primary/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[35%] h-[35%] bg-blue-500/15 rounded-full blur-[100px] pointer-events-none" />

      <Sidebar className="hidden md:flex relative z-20" />
      
      <div className="md:hidden absolute top-3 left-4 z-30">
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

      <div className="flex-1 relative z-10 overflow-y-auto w-full h-full">
        {children}
      </div>
    </div>
  );
}
