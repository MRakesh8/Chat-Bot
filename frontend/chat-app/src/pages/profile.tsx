import { useAuth } from "../contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto p-8 text-foreground">
        <h1 className="text-3xl font-semibold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">Profile</h1>
        
        <div className="max-w-2xl">
          <div className="p-8 rounded-2xl bg-card/40 border border-white/5 backdrop-blur-xl shadow-lg flex flex-col items-center text-center">
            <Avatar className="w-24 h-24 border-2 border-border mb-4">
              <AvatarImage src={user?.user_metadata?.avatar_url} />
              <AvatarFallback className="bg-primary/20 text-primary text-2xl">
                {user?.email?.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h1 className="text-3xl font-bold text-foreground">{user?.email || 'User'}</h1>
            <p className="text-muted-foreground mb-6">{user?.email}</p>
            
            <div className="grid grid-cols-2 gap-4 w-full mt-4 pt-6 border-t border-white/5">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 shadow-sm">
                <div className="text-2xl font-bold text-foreground mb-1">PRO</div>
                <div className="text-sm text-foreground/70">Current Plan</div>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 shadow-sm">
                <div className="text-2xl font-bold text-foreground mb-1">Active</div>
                <div className="text-sm text-foreground/70">Status</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
