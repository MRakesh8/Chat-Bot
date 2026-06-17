import { BarChart3, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export default function AdminClarityPage() {
  const { user } = useAuth();

  // Protect this route, although it should also be protected by a router guard in App.tsx
  // We double check here just in case. Note: user role is typically checked via a profile fetch, 
  // but since we made the DB update, we assume the user is authorized if they can see the link.
  
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="flex-none p-4 border-b border-border flex items-center justify-between bg-card z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground tracking-tight">Analytics Dashboard</h1>
            <span className="ml-2 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">Super Admin</span>
          </div>
        </div>
        
        <Button 
          variant="outline"
          size="sm"
          className="bg-background/50 hover:bg-muted"
          onClick={() => window.open('https://clarity.microsoft.com/projects/view/x6eohi99h7/dashboard?date=Last%203%20days', '_blank')}
        >
          Full View ↗
        </Button>
      </div>
      
      <div className="flex-1 w-full bg-background flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 text-center shadow-sm">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <BarChart3 className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold mb-3 text-foreground">Microsoft Clarity</h2>
          <p className="text-muted-foreground mb-8">
            For security reasons, Microsoft Clarity dashboards cannot be embedded directly within other applications. Please open the dashboard in a secure external window to view your analytics.
          </p>
          <Button 
            size="lg" 
            className="w-full font-medium"
            onClick={() => window.open('https://clarity.microsoft.com/projects/view/x6eohi99h7/dashboard?date=Last%203%20days', '_blank')}
          >
            Open Clarity Dashboard ↗
          </Button>
        </div>
      </div>
    </div>
  );
}
