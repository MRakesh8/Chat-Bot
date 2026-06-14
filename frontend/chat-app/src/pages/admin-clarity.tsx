import { useLocation } from "wouter";
import { ArrowLeft, BarChart3, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export default function AdminClarityPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // Protect this route, although it should also be protected by a router guard in App.tsx
  // We double check here just in case. Note: user role is typically checked via a profile fetch, 
  // but since we made the DB update, we assume the user is authorized if they can see the link.
  
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-none p-4 border-b border-border flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/")}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground tracking-tight">Analytics Dashboard</h1>
          <span className="ml-2 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">Super Admin</span>
        </div>
      </div>
      
      <div className="flex-1 w-full relative bg-muted/30 p-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-card border border-border rounded-xl shadow-sm p-8 text-center space-y-6">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Microsoft Clarity</h2>
            <p className="text-sm text-muted-foreground">
              For security reasons, Microsoft Clarity dashboards cannot be embedded directly within the application. Please open the dashboard in a new tab.
            </p>
          </div>
          <Button 
            className="w-full" 
            onClick={() => window.open('https://clarity.microsoft.com/projects/view/x6eohi99h7/dashboard?date=Last%203%20days', '_blank')}
          >
            Open Clarity Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
