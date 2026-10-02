import { Link } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  const rawName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || "User";
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto p-8 text-foreground max-w-4xl">
        <h1 className="text-3xl font-bold mb-8 text-foreground tracking-tight">Profile & Account</h1>
        
        <div className="max-w-2xl">
          <div className="p-8 rounded-2xl bg-card border border-border shadow-md flex flex-col items-center text-center">
            <Avatar className="w-24 h-24 border-2 border-border mb-4 shadow-sm">
              <AvatarImage src={user?.user_metadata?.avatar_url} />
              <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold">
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-2xl font-bold text-foreground">{displayName}</h2>
            <p className="text-sm text-muted-foreground mb-6 font-medium">{user?.email}</p>
            
            <div className="grid grid-cols-2 gap-4 w-full mt-4 pt-6 border-t border-border/60">
              <div className="col-span-2 p-4 rounded-xl bg-secondary/40 border border-border shadow-2xs">
                <div className="text-xs text-muted-foreground font-medium mb-2">Want to manage your plan or see your billing history?</div>
                <Link href="/billing" className="text-primary hover:underline font-semibold inline-flex items-center gap-1 text-xs">
                  Go to Billing & Subscription →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
