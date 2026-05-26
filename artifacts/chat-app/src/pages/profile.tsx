import { Sidebar } from "@/components/sidebar";
import { useUser } from "@clerk/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function ProfilePage() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) return null;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <Sidebar className="hidden md:flex" />
      <div className="flex-1 overflow-y-auto p-8 text-white">
        <h1 className="text-3xl font-semibold mb-8">Profile</h1>
        
        <div className="max-w-2xl">
          <div className="p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex flex-col items-center text-center">
            <Avatar className="w-24 h-24 border-2 border-white/10 mb-4">
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback className="bg-primary/20 text-primary text-2xl">
                {user?.firstName?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-2xl font-medium mb-1">{user?.fullName || 'User'}</h2>
            <p className="text-zinc-400 mb-6">{user?.primaryEmailAddress?.emailAddress}</p>
            
            <div className="grid grid-cols-2 gap-4 w-full mt-4 pt-6 border-t border-white/10">
              <div className="p-4 rounded-xl bg-black/40 border border-white/5">
                <div className="text-2xl font-bold text-white mb-1">PRO</div>
                <div className="text-sm text-zinc-400">Current Plan</div>
              </div>
              <div className="p-4 rounded-xl bg-black/40 border border-white/5">
                <div className="text-2xl font-bold text-white mb-1">Active</div>
                <div className="text-sm text-zinc-400">Status</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
