import { useTheme } from "@/contexts/ThemeContext";
import { ApiKeysSettings } from "@/components/ApiKeysSettings";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex w-full h-full bg-transparent overflow-x-hidden">
      <div className="flex-1 p-6 pt-16 md:p-8 text-foreground max-w-full overflow-x-hidden">
        <h1 className="text-4xl font-bold mb-10 text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 tracking-tight">Settings</h1>
        
        <div className="max-w-3xl space-y-10">
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b border-white/10 pb-3 text-foreground/90">Appearance</h2>
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.2)] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-medium text-lg">Theme</h3>
                <p className="text-sm text-muted-foreground mt-1">Customize the look and feel of Aria.</p>
              </div>
              <select 
                value={theme}
                onChange={(e) => setTheme(e.target.value as any)}
                className="w-full sm:w-auto bg-background/50 border border-white/10 rounded-xl px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 hover:bg-background transition-colors cursor-pointer"
              >
                <option value="system">System</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b border-white/10 pb-3 text-foreground/90">Language & Voice</h2>
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.2)] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-medium text-lg">Language</h3>
                <p className="text-sm text-muted-foreground mt-1">Select the primary language for interactions.</p>
              </div>
              <select className="w-full sm:w-auto bg-background/50 border border-white/10 rounded-xl px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 hover:bg-background transition-colors cursor-pointer">
                <option>English</option>
                <option>Tamil</option>
              </select>
            </div>
            
            <div className="p-5 rounded-2xl bg-white/[0.01] border border-white/[0.02] backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm opacity-50 pointer-events-none">
              <div>
                <h3 className="font-medium text-lg">Voice Mode</h3>
                <p className="text-sm text-muted-foreground mt-1">Choose Aria's spoken voice (Coming soon).</p>
              </div>
              <button disabled className="w-full sm:w-auto px-6 py-2 bg-white/5 rounded-xl text-sm text-foreground font-medium border border-white/10">Select</button>
            </div>
          </section>

          <ApiKeysSettings />
        </div>
      </div>
    </div>
  );
}
