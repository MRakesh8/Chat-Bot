import { Loader2 } from "lucide-react"

export function GlobalLoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md">
      <div className="flex flex-col items-center gap-6 p-8 rounded-3xl bg-card border border-border shadow-2xl animate-in fade-in zoom-in duration-500">
        <div className="relative flex items-center justify-center w-20 h-20">
          <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin" />
          <div className="absolute inset-2 rounded-full border-r-2 border-primary/70 animate-spin animation-delay-150" />
          <div className="absolute inset-4 rounded-full border-b-2 border-primary/40 animate-spin animation-delay-300" />
          <Loader2 className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            NOVA Business AI
          </h2>
          <p className="text-sm text-muted-foreground animate-pulse">
            Loading your experience...
          </p>
        </div>
      </div>
    </div>
  )
}
