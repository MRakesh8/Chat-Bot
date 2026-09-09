import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { FileQuestion, ArrowLeft, FolderKanban, MessageSquare } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground relative overflow-hidden px-6 py-12">
      {/* Ambient background glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full text-center space-y-6 relative z-10 bg-card/60 backdrop-blur-xl border border-foreground/10 p-8 md:p-10 rounded-3xl shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
          <FileQuestion className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
            404 — Page Not Found
          </span>
          <h1 className="text-3xl font-bold text-foreground tracking-tight pt-2">
            Lost in Space?
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
            The page you are looking for does not exist or may have been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-foreground/5">
          <Button
            onClick={() => setLocation("/projects")}
            className="w-full sm:w-auto gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-11 px-5 font-medium"
          >
            <FolderKanban className="w-4 h-4" /> Projects
          </Button>
          <Button
            variant="outline"
            onClick={() => setLocation("/chat")}
            className="w-full sm:w-auto gap-2 border-foreground/10 hover:bg-foreground/5 rounded-xl h-11 px-5 font-medium"
          >
            <MessageSquare className="w-4 h-4" /> Workspace Chat
          </Button>
        </div>
      </div>
    </div>
  );
}

