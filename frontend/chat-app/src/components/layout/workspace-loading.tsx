import { Loader2 } from "lucide-react";

export function WorkspaceLoadingFallback() {
  return (
    <div className="flex-1 w-full h-full min-h-[50vh] flex flex-col items-center justify-center p-8 space-y-4">
      <div className="relative flex items-center justify-center w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        <Loader2 className="w-5 h-5 text-primary animate-pulse" />
      </div>
      <p className="text-xs text-muted-foreground font-medium animate-pulse">
        Loading workspace view...
      </p>
    </div>
  );
}
