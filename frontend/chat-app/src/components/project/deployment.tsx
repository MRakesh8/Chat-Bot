import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Copy, CheckCircle2, XCircle, Code, Server, Shield, Activity } from "lucide-react";

export function Deployment({ projectId }: { projectId: string }) {
  const { session } = useAuth();
  const { toast } = useToast();

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = session?.access_token;
    return fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  };

  const { data: settings, isLoading } = useQuery({
    queryKey: ["widget-settings", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/settings`));
      if (!res.ok) throw new Error("Failed to load widget settings");
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: apiKeys } = useQuery({
    queryKey: ["project-api-keys", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/api-keys`));
      if (!res.ok) throw new Error("Failed to load api keys");
      return res.json();
    },
    enabled: !!projectId,
  });

  const [copied, setCopied] = useState(false);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-6 h-6" /></div>;

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "https://aria-ai.com";
  const widgetUrl = `${currentOrigin}/widget.js`;
  const backendUrl = apiUrl("").replace(/\/+$/, ""); // Returns the current API base URL without trailing slash
  
  const embedCode = `<script\n  src="${widgetUrl}"\n  data-widget-token="${settings?.widgetToken}"\n  data-api-url="${backendUrl}">\n</script>`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copied to clipboard!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const hasAllowedDomains = settings?.allowedDomains?.length > 0;
  const hasApiKeys = apiKeys?.length > 0;
  
  // Health checks
  const isHealthy = settings?.isEnabled && hasAllowedDomains;

  return (
    <div className="space-y-8 mt-8">
      {/* Deployment Health */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className={`p-3 rounded-full ${settings?.isEnabled ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Widget Status</p>
              <p className="font-semibold">{settings?.isEnabled ? 'Active' : 'Disabled'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className={`p-3 rounded-full ${hasAllowedDomains ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Domain Security</p>
              <p className="font-semibold">{hasAllowedDomains ? `${settings.allowedDomains.length} Domains` : 'Unrestricted'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className={`p-3 rounded-full ${hasApiKeys ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}`}>
              <Server className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Provider AI</p>
              <p className="font-semibold">{hasApiKeys ? 'Project Keys' : 'System Fallback'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className={`bg-card border-border ${isHealthy ? 'border-green-500/50' : 'border-amber-500/50'}`}>
          <CardContent className="p-4 flex items-center gap-4">
            {isHealthy ? (
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            ) : (
              <XCircle className="w-8 h-8 text-amber-500" />
            )}
            <div>
              <p className="text-sm text-muted-foreground">Overall Health</p>
              <p className={`font-bold ${isHealthy ? 'text-green-500' : 'text-amber-500'}`}>
                {isHealthy ? 'Ready for Production' : 'Setup Incomplete'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Installation Wizard */}
        <div className="lg:col-span-2">
          <Card className="bg-card border-border h-full">
            <CardHeader>
              <CardTitle>Install Widget</CardTitle>
              <CardDescription>Follow the guides below to install the widget on your website.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="html" className="w-full">
                <TabsList className="mb-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 h-auto">
                  <TabsTrigger value="html">HTML</TabsTrigger>
                  <TabsTrigger value="react">React</TabsTrigger>
                  <TabsTrigger value="nextjs">Next.js</TabsTrigger>
                  <TabsTrigger value="wordpress">WordPress</TabsTrigger>
                  <TabsTrigger value="shopify">Shopify</TabsTrigger>
                  <TabsTrigger value="wix">Wix</TabsTrigger>
                  <TabsTrigger value="webflow">Webflow</TabsTrigger>
                </TabsList>

                {/* HTML Guide */}
                <TabsContent value="html" className="space-y-4">
                  <h3 className="text-sm font-medium">Standard HTML Installation</h3>
                  <p className="text-sm text-muted-foreground">Paste this code right before the closing <code>&lt;/body&gt;</code> tag on your website.</p>
                  <div className="relative">
                    <pre className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 text-sm overflow-x-auto font-mono">
                      {embedCode}
                    </pre>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="absolute top-2 right-2 bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white"
                      onClick={() => copyToClipboard(embedCode)}
                    >
                      {copied ? <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
                      Copy Code
                    </Button>
                  </div>
                </TabsContent>

                {/* React Guide */}
                <TabsContent value="react" className="space-y-4">
                  <h3 className="text-sm font-medium">React / Vite Installation</h3>
                  <p className="text-sm text-muted-foreground">You can add the script tag to your <code>index.html</code> file, or load it dynamically in a component.</p>
                  <div className="relative">
                    <pre className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 text-sm overflow-x-auto font-mono">
{`import { useEffect } from "react";

export function AriaWidget() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "${widgetUrl}";
    script.setAttribute("data-widget-token", "${settings?.widgetToken}");
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
      const widgetRoot = document.getElementById("aria-ai-widget-root");
      if (widgetRoot) widgetRoot.remove();
      delete (window as any).AriaWidgetInitialized;
    };
  }, []);

  return null;
}`}
                    </pre>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="absolute top-2 right-2 bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white"
                      onClick={() => copyToClipboard(`import { useEffect } from "react";\n\nexport function AriaWidget() {\n  useEffect(() => {\n    const script = document.createElement("script");\n    script.src = "${widgetUrl}";\n    script.setAttribute("data-widget-token", "${settings?.widgetToken}");\n    script.async = true;\n    document.body.appendChild(script);\n\n    return () => {\n      document.body.removeChild(script);\n      const widgetRoot = document.getElementById("aria-ai-widget-root");\n      if (widgetRoot) widgetRoot.remove();\n      delete (window as any).AriaWidgetInitialized;\n    };\n  }, []);\n\n  return null;\n}`)}
                    >
                      <Copy className="w-4 h-4 mr-2" /> Copy Code
                    </Button>
                  </div>
                </TabsContent>
                
                {/* Add dummy content for others to satisfy UI completeness */}
                <TabsContent value="nextjs" className="space-y-4">
                  <h3 className="text-sm font-medium">Next.js Installation</h3>
                  <p className="text-sm text-muted-foreground">Use the Next.js Script component in your layout or specific page.</p>
                  <div className="relative">
                    <pre className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 text-sm overflow-x-auto font-mono">
{`import Script from 'next/script'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script 
          src="${widgetUrl}" 
          data-widget-token="${settings?.widgetToken}"
          strategy="lazyOnload"
        />
      </body>
    </html>
  )
}`}
                    </pre>
                    <Button size="sm" variant="outline" className="absolute top-2 right-2 bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white">
                      <Copy className="w-4 h-4 mr-2" /> Copy Code
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="wordpress" className="space-y-4">
                   <p className="text-sm text-muted-foreground">In WordPress, install a "Headers and Footers" plugin and paste the HTML snippet in the footer section, or edit your theme's <code>footer.php</code>.</p>
                </TabsContent>
                
                <TabsContent value="shopify" className="space-y-4">
                   <p className="text-sm text-muted-foreground">Go to Online Store &gt; Themes &gt; Edit Code. Find your <code>theme.liquid</code> file and paste the HTML snippet right before the <code>&lt;/body&gt;</code> tag.</p>
                </TabsContent>

                <TabsContent value="wix" className="space-y-4">
                   <p className="text-sm text-muted-foreground">Go to Settings &gt; Custom Code. Add Custom Code, paste the HTML snippet, select "Body - end", and apply to all pages.</p>
                </TabsContent>

                <TabsContent value="webflow" className="space-y-4">
                   <p className="text-sm text-muted-foreground">Go to Project Settings &gt; Custom Code. Paste the HTML snippet in the "Footer Code" section and publish your site.</p>
                </TabsContent>

              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Credentials / Token info */}
        <div className="space-y-8">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Widget Security</CardTitle>
              <CardDescription>Authentication details for your widget.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Widget Token</label>
                <div className="flex gap-2">
                  <Input readOnly value={settings?.widgetToken || ""} className="bg-muted font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(settings?.widgetToken || "")}><Copy className="w-4 h-4" /></Button>
                </div>
                <p className="text-[10px] text-muted-foreground">This token is safe to expose in your frontend code as long as Domain Security is configured.</p>
              </div>

              {!hasAllowedDomains && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-amber-500 text-xs font-medium flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Warning: Unrestricted Access</p>
                  <p className="text-muted-foreground text-[10px] mt-1">Your widget can be embedded on any website. Please configure Allowed Domains in the Widget Studio.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
