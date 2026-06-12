import { Sidebar } from "@/components/sidebar";
import { useTheme } from "@/contexts/ThemeContext";
import { ApiKeysSettings } from "@/components/ApiKeysSettings";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <Sidebar className="hidden md:flex" />
      <div className="flex-1 overflow-y-auto p-6 text-foreground md:p-8">
        <h1 className="text-3xl font-semibold mb-8">Settings</h1>
        
        <div className="max-w-2xl space-y-8">
          <section className="space-y-4">
            <h2 className="text-xl font-medium border-b border-border pb-2">Appearance</h2>
            <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between">
              <div>
                <h3 className="font-medium">Theme</h3>
                <p className="text-sm text-muted-foreground">Customize the look and feel of Aria.</p>
              </div>
              <select 
                value={theme}
                onChange={(e) => setTheme(e.target.value as any)}
                className="bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="system">System</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-medium border-b border-border pb-2">Language & Voice</h2>
            <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between">
              <div>
                <h3 className="font-medium">Language</h3>
                <p className="text-sm text-muted-foreground">Select the primary language for interactions.</p>
              </div>
              <select className="bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option>English</option>
                <option>Tamil</option>
              </select>
            </div>
            
            <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between opacity-50 pointer-events-none">
              <div>
                <h3 className="font-medium">Voice Mode</h3>
                <p className="text-sm text-muted-foreground">Choose Aria's spoken voice (Coming soon).</p>
              </div>
              <button disabled className="px-3 py-1.5 bg-muted rounded-md text-sm text-foreground">Select</button>
            </div>
          </section>

          <ApiKeysSettings />
        </div>
      </div>
    </div>
  );
}
