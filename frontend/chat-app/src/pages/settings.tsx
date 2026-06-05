import { Sidebar } from "@/components/sidebar";

export default function SettingsPage() {
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <Sidebar className="hidden md:flex" />
      <div className="flex-1 overflow-y-auto p-8 text-white">
        <h1 className="text-3xl font-semibold mb-8">Settings</h1>
        
        <div className="max-w-2xl space-y-8">
          <section className="space-y-4">
            <h2 className="text-xl font-medium border-b border-white/10 pb-2">Appearance</h2>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div>
                <h3 className="font-medium">Theme</h3>
                <p className="text-sm text-zinc-400">Customize the look and feel of Aria.</p>
              </div>
              <select className="bg-black/50 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary">
                <option>System</option>
                <option>Dark</option>
                <option>Light</option>
              </select>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-medium border-b border-white/10 pb-2">Language & Voice</h2>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div>
                <h3 className="font-medium">Language</h3>
                <p className="text-sm text-zinc-400">Select the primary language for interactions.</p>
              </div>
              <select className="bg-black/50 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary">
                <option>English</option>
                <option>Tamil</option>
              </select>
            </div>
            
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between opacity-50 pointer-events-none">
              <div>
                <h3 className="font-medium">Voice Mode</h3>
                <p className="text-sm text-zinc-400">Choose Aria's spoken voice (Coming soon).</p>
              </div>
              <button disabled className="px-3 py-1.5 bg-white/10 rounded-md text-sm text-white">Select</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
