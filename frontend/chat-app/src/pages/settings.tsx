import { useTheme } from "@/contexts/ThemeContext";
import { ApiKeysSettings } from "@/components/ApiKeysSettings";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex w-full h-full bg-background overflow-x-hidden">
      <div className="flex-1 p-6 pt-16 md:p-8 text-foreground max-w-full overflow-x-hidden">
        <h1 className="text-3xl font-semibold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">Settings</h1>
        
        <div className="max-w-2xl space-y-8">
          <section className="space-y-4">
            <h2 className="text-xl font-medium border-b border-white/5 pb-2 text-foreground/80">Appearance</h2>
            <div className="p-4 rounded-xl bg-card/40 border border-white/5 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm hover:bg-card/60 transition-colors">
              <div>
                <h3 className="font-medium">Theme</h3>
                <p className="text-sm text-muted-foreground">Customize the look and feel of Aria.</p>
              </div>
              <select 
                value={theme}
                onChange={(e) => setTheme(e.target.value as any)}
                className="w-full sm:w-auto bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="system">System</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-medium border-b border-white/5 pb-2 text-foreground/80">Language & Voice</h2>
            <div className="p-4 rounded-xl bg-card/40 border border-white/5 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm hover:bg-card/60 transition-colors">
              <div>
                <h3 className="font-medium">Language</h3>
                <p className="text-sm text-muted-foreground">Select the primary language for interactions.</p>
              </div>
              <select className="w-full sm:w-auto bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option>English</option>
                <option>Tamil</option>
              </select>
            </div>
            
            <div className="p-4 rounded-xl bg-card/40 border border-white/5 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm opacity-50 pointer-events-none">
              <div>
                <h3 className="font-medium">Voice Mode</h3>
                <p className="text-sm text-muted-foreground">Choose Aria's spoken voice (Coming soon).</p>
              </div>
              <button disabled className="w-full sm:w-auto px-3 py-1.5 bg-muted rounded-md text-sm text-foreground">Select</button>
            </div>
          </section>

          <ApiKeysSettings />
        </div>
      </div>
    </div>
  );
}
