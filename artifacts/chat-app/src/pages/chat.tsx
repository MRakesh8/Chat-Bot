import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useListGeminiConversations } from "@workspace/api-client-react";
import { Sidebar } from "@/components/sidebar";
import { ChatArea } from "@/components/chat-area";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function ChatPage() {
  const { data: conversations, isLoading } = useListGeminiConversations();
  const [, setLocation] = useLocation();
  const params = useParams();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Redirect to most recent chat if at /chat root and we have conversations
  useEffect(() => {
    if (!isLoading && !params.id && conversations && conversations.length > 0) {
      setLocation(`/chat/${conversations[0].id}`);
    }
  }, [isLoading, params.id, conversations, setLocation]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <Sidebar className="hidden md:flex" />
      
      <div className="md:hidden absolute top-3 left-4 z-20">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white bg-background/80 backdrop-blur-md border border-white/5">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 border-r border-white/10 w-[280px]">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      <ChatArea />
    </div>
  );
}

