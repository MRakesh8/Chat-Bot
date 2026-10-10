import { Link } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, CreditCard, ShieldCheck } from "lucide-react";

export default function ProfilePage() {
  const { user, dbUser } = useAuth();

  if (!user) return null;

  const rawName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || "User";
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  return (
    <div className="flex w-full h-full bg-transparent overflow-x-hidden">
      <div className="flex-1 p-6 md:p-8 text-foreground max-w-4xl mx-auto space-y-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs px-2.5 py-0.5 rounded-full font-semibold">
              Global Account Scope
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Profile & Account</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account identity, security, and personal profile information.</p>
        </div>
        
        <div className="max-w-2xl">
          <div className="p-8 rounded-2xl bg-card border border-border shadow-xs flex flex-col items-center text-center">
            <Avatar className="w-24 h-24 border-2 border-border mb-4 shadow-sm">
              <AvatarImage src={user?.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`} />
              <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold">
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-2xl font-bold text-foreground">{displayName}</h2>
            <p className="text-sm text-muted-foreground mb-4 font-medium">{user?.email}</p>

            {dbUser?.role && (
              <Badge variant="secondary" className="capitalize text-xs px-3 py-1 mb-6 rounded-full gap-1.5 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                <span>{dbUser.role.replace("_", " ")}</span>
              </Badge>
            )}
            
            <div className="grid grid-cols-2 gap-4 w-full mt-2 pt-6 border-t border-border/60">
              <div className="col-span-2 p-4 rounded-xl bg-secondary/40 border border-border/80 shadow-2xs text-left">
                <div className="text-xs text-muted-foreground font-medium mb-2">Subscription & Plan</div>
                <Link href="/billing" className="text-primary hover:underline font-semibold inline-flex items-center gap-1.5 text-xs">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Go to Billing & Subscription →</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
