import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save } from "lucide-react";

export function WidgetStudio({ projectId }: { projectId: string }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const [formData, setFormData] = useState<any>({});
  
  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/settings`), {
        method: "PUT",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update widget settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget-settings", projectId] });
      toast({ title: "Widget settings saved!" });
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-6 h-6" /></div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
      {/* Settings Form */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Widget Studio</CardTitle>
          <CardDescription>Customize how your AI assistant appears on external websites.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="basic">Basic Settings</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <form onSubmit={handleSubmit} className="space-y-6">
              <TabsContent value="basic" className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-muted border border-border rounded-lg">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">Enable Widget</h3>
                    <p className="text-xs text-muted-foreground">Allow this chatbot to be loaded via embed script</p>
                  </div>
                  <Switch
                    checked={formData.isEnabled ?? true}
                    onCheckedChange={(c) => setFormData({ ...formData, isEnabled: c })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Bot Name</label>
                  <Input 
                    value={formData.botName || ""}
                    onChange={(e) => setFormData({ ...formData, botName: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Welcome Message</label>
                  <Textarea 
                    value={formData.welcomeMessage || ""}
                    onChange={(e) => setFormData({ ...formData, welcomeMessage: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Theme Color</label>
                  <div className="flex items-center gap-3">
                    <Input 
                      type="color" 
                      className="w-16 h-10 p-1 bg-card"
                      value={formData.themeColor || "#8B5CF6"}
                      onChange={(e) => setFormData({ ...formData, themeColor: e.target.value })}
                    />
                    <Input 
                      value={formData.themeColor || "#8B5CF6"}
                      onChange={(e) => setFormData({ ...formData, themeColor: e.target.value })}
                      placeholder="#8B5CF6"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Display Mode</label>
                  <Select 
                    value={formData.displayMode || "floating"} 
                    onValueChange={(val) => setFormData({ ...formData, displayMode: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="floating">Floating Bubble</SelectItem>
                      <SelectItem value="panel">Chat Panel (Slide-out)</SelectItem>
                      <SelectItem value="full-screen">Full Screen Mobile</SelectItem>
                      <SelectItem value="custom">Custom Container</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Allowed Domains</label>
                  <p className="text-xs text-muted-foreground">Comma separated domains (e.g. arunshop.com, www.example.com)</p>
                  <Input 
                    value={(formData.allowedDomains || []).join(", ")}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      allowedDomains: e.target.value.split(",").map(d => d.trim()).filter(Boolean) 
                    })}
                    placeholder="example.com"
                  />
                </div>

                {formData.displayMode === "custom" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Custom Container ID</label>
                    <Input 
                      value={formData.customContainerId || ""}
                      onChange={(e) => setFormData({ ...formData, customContainerId: e.target.value })}
                      placeholder="aria-ai-chat"
                    />
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Human Handoff (Optional)</label>
                    <p className="text-xs text-muted-foreground">Contact details if the AI cannot help.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs">WhatsApp Number</label>
                      <Input 
                        value={formData.humanHandoffLinks?.whatsapp || ""}
                        onChange={(e) => setFormData({ ...formData, humanHandoffLinks: { ...formData.humanHandoffLinks, whatsapp: e.target.value } })}
                        placeholder="+1234567890"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs">Telegram Username</label>
                      <Input 
                        value={formData.humanHandoffLinks?.telegram || ""}
                        onChange={(e) => setFormData({ ...formData, humanHandoffLinks: { ...formData.humanHandoffLinks, telegram: e.target.value } })}
                        placeholder="@username"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs">Email Address</label>
                      <Input 
                        value={formData.humanHandoffLinks?.email || ""}
                        onChange={(e) => setFormData({ ...formData, humanHandoffLinks: { ...formData.humanHandoffLinks, email: e.target.value } })}
                        placeholder="support@domain.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs">Phone Number</label>
                      <Input 
                        value={formData.humanHandoffLinks?.phone || ""}
                        onChange={(e) => setFormData({ ...formData, humanHandoffLinks: { ...formData.humanHandoffLinks, phone: e.target.value } })}
                        placeholder="+1234567890"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Custom CSS</label>
                  <Textarea 
                    value={formData.customCss || ""}
                    onChange={(e) => setFormData({ ...formData, customCss: e.target.value })}
                    placeholder=".widget-container { ... }"
                    className="font-mono text-xs h-32"
                  />
                </div>
              </TabsContent>

              <Button type="submit" disabled={updateMutation.isPending} className="w-full gap-2">
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Widget Settings
              </Button>
            </form>
          </Tabs>
        </CardContent>
      </Card>

      {/* Live Preview Pane */}
      <Card className="bg-card border-border overflow-hidden flex flex-col h-[700px] sticky top-6">
        <CardHeader className="border-b border-border bg-muted/30 pb-4">
          <CardTitle className="text-sm">Live Preview</CardTitle>
          <CardDescription className="text-xs">This is how your widget will look on desktop.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 bg-zinc-950 p-0 relative">
          {/* Mock Website Background */}
          <div className="absolute inset-0 p-8">
             <div className="w-3/4 h-8 bg-zinc-900 rounded mb-4 animate-pulse"></div>
             <div className="w-full h-4 bg-zinc-900 rounded mb-2 animate-pulse"></div>
             <div className="w-5/6 h-4 bg-zinc-900 rounded animate-pulse"></div>
          </div>
          
          {/* Mock Widget UI */}
          <div className="absolute bottom-6 right-6 flex flex-col items-end z-10 w-[350px]">
            {/* Chat Panel Mock */}
            <div className="w-full bg-[#18181b] border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl mb-4 flex flex-col transition-all duration-300" style={{ height: "450px" }}>
              {/* Header */}
              <div className="p-4 flex items-center justify-between text-white" style={{ backgroundColor: formData.themeColor || "#8B5CF6" }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold">
                    {formData.botName?.charAt(0) || "A"}
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm leading-none">{formData.botName || "AI Assistant"}</h4>
                    <span className="text-[10px] text-white/80 mt-1 inline-block">● Online</span>
                  </div>
                </div>
              </div>
              
              {/* Messages Area */}
              <div className="flex-1 p-4 bg-zinc-950 overflow-y-auto">
                <div className="flex items-start gap-2 mb-4">
                  <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] text-white" style={{ backgroundColor: formData.themeColor || "#8B5CF6" }}>
                    {formData.botName?.charAt(0) || "A"}
                  </div>
                  <div className="bg-zinc-900 text-zinc-200 text-sm p-3 rounded-2xl rounded-tl-none border border-zinc-800">
                    {formData.welcomeMessage || "Hello 👋"}
                  </div>
                </div>
              </div>

              {/* Input Area */}
              <div className="p-3 bg-zinc-950 border-t border-zinc-800">
                <div className="bg-zinc-900 rounded-full flex items-center px-4 py-2 border border-zinc-800">
                  <span className="text-zinc-500 text-sm">Ask a question...</span>
                </div>
              </div>
            </div>

            {/* Floating Bubble Mock */}
            {formData.displayMode === "floating" && (
               <div 
                 className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white cursor-pointer hover:scale-105 transition-transform"
                 style={{ backgroundColor: formData.themeColor || "#8B5CF6" }}
               >
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
               </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
