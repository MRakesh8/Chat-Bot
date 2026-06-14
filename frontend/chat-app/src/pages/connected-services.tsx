import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Github, Linkedin, ExternalLink, Copy, Edit2, Trash2, 
  MoreVertical, Plus, Box, Database, BarChart3, LineChart, 
  Search, Play, Globe, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiBaseUrl } from "@/lib/api-url";
import { useAuth } from "@/contexts/AuthContext";

type Service = {
  id: string;
  provider: string;
  name: string;
  url: string;
  description: string | null;
  status: string;
};

const PROVIDERS = [
  { id: "github", label: "GitHub", icon: Github },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin },
  { id: "render", label: "Render", icon: Box },
  { id: "supabase", label: "Supabase", icon: Database },
  { id: "microsoft_clarity", label: "Microsoft Clarity", icon: BarChart3 },
  { id: "google_analytics", label: "Google Analytics", icon: LineChart },
  { id: "google_search_console", label: "Search Console", icon: Search },
  { id: "youtube", label: "YouTube", icon: Play },
  { id: "custom", label: "Custom Service", icon: Globe },
];

export default function ConnectedServicesPage() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const getHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
  };

  const { data: services = [], isLoading } = useQuery<Service[]>({
    queryKey: ["connectedServices"],
    queryFn: async () => {
      const res = await fetch(`${apiBaseUrl}/api/services`, { headers: getHeaders() });
      if (!res.ok) throw new Error("Failed to fetch services");
      return res.json();
    },
    enabled: !!session,
  });

  const addMutation = useMutation({
    mutationFn: async (data: Partial<Service>) => {
      const res = await fetch(`${apiBaseUrl}/api/services`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add service");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectedServices"] });
      setIsAddOpen(false);
      toast({ title: "Service added successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const editMutation = useMutation({
    mutationFn: async (data: Partial<Service> & { id: string }) => {
      const { id, ...rest } = data;
      const res = await fetch(`${apiBaseUrl}/api/services/${id}`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(rest),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update service");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectedServices"] });
      setIsEditOpen(false);
      setEditingService(null);
      toast({ title: "Service updated successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiBaseUrl}/api/services/${id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete service");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectedServices"] });
      toast({ title: "Service removed" });
    },
  });

  const handleOpenUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        toast({ title: "Security Blocked", description: "Only HTTP/HTTPS URLs are allowed.", variant: "destructive" });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: "Error", description: "Invalid URL format.", variant: "destructive" });
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "URL copied successfully." });
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-transparent">
      <div className="flex-1 overflow-y-auto p-6 pt-16 md:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-10 gap-4">
          <div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 tracking-tight">Connected Services</h1>
            <p className="text-muted-foreground mt-2 text-sm">Manage and quickly access your integrated platforms.</p>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary shadow-[0_0_20px_rgba(var(--primary),0.3)] text-primary-foreground border-0 h-10 px-6 font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                <Plus className="w-4 h-4" /> Add Service
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add Connected Service</DialogTitle>
              </DialogHeader>
              <ServiceForm onSubmit={(d) => addMutation.mutate(d)} isPending={addMutation.isPending} />
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">Loading services...</div>
        ) : services.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl bg-white/[0.02] backdrop-blur-xl">
            <Globe className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
            <p className="text-muted-foreground font-medium">No services connected yet.</p>
            <Button variant="outline" className="mt-6 rounded-xl border-white/10 bg-white/5 hover:bg-white/10" onClick={() => setIsAddOpen(true)}>Add your first service</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {services.map((service) => {
              const ProviderIcon = PROVIDERS.find(p => p.id === service.provider)?.icon || Globe;
              return (
                <div key={service.id} className="p-6 rounded-3xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.2)] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 flex flex-col group relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div className="flex justify-between items-start mb-5 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 rounded-2xl shadow-inner border border-primary/20">
                        <ProviderIcon className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground text-lg leading-tight">{service.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1 max-w-[150px] truncate">{service.url}</p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full hover:bg-white/10">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl border-white/10 bg-[#121214]/95 backdrop-blur-xl">
                          <DropdownMenuItem onClick={() => handleOpenUrl(service.url)} className="rounded-lg my-0.5 hover:bg-white/10"><ExternalLink className="w-4 h-4 mr-2" /> Open</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCopyUrl(service.url)} className="rounded-lg my-0.5 hover:bg-white/10"><Copy className="w-4 h-4 mr-2" /> Copy URL</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setEditingService(service);
                            setIsEditOpen(true);
                          }} className="rounded-lg my-0.5 hover:bg-white/10"><Edit2 className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteMutation.mutate(service.id)} className="text-red-400 hover:bg-red-500/10 hover:text-red-300 focus:bg-red-500/10 focus:text-red-300 rounded-lg my-0.5"><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  
                  {service.description && (
                    <p className="text-sm text-foreground/70 mb-5 flex-1 relative z-10">{service.description}</p>
                  )}
                  
                  <div className="flex items-center gap-2 mt-auto pt-4 border-t border-white/5 relative z-10">
                    <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2.5 py-1.5 rounded-lg border border-emerald-400/20">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      Connected
                    </div>
                  </div>
                  
                  <div className="absolute transition-opacity duration-300 bottom-5 right-5 flex gap-2 z-20 opacity-100">
                     <Button size="sm" variant="secondary" onClick={() => handleCopyUrl(service.url)} className="h-9 rounded-xl bg-white/10 hover:bg-white/20 border-white/5 text-foreground shadow-lg" title="Copy URL">
                        <Copy className="w-4 h-4" />
                     </Button>
                     <Button size="sm" onClick={() => handleOpenUrl(service.url)} className="h-9 rounded-xl gap-2 shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground border-0">
                        Open <ExternalLink className="w-3.5 h-3.5" />
                     </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Service</DialogTitle>
            </DialogHeader>
            {editingService && (
              <ServiceForm 
                defaultValues={editingService}
                onSubmit={(d) => editMutation.mutate({ ...d, id: editingService.id })} 
                isPending={editMutation.isPending} 
              />
            )}
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}

function ServiceForm({ onSubmit, isPending, defaultValues }: { onSubmit: (data: any) => void, isPending: boolean, defaultValues?: any }) {
  const [provider, setProvider] = useState(defaultValues?.provider || "github");
  const [name, setName] = useState(defaultValues?.name || "");
  const [url, setUrl] = useState(defaultValues?.url || "");
  const [description, setDescription] = useState(defaultValues?.description || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ provider, name, url, description });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label>Provider</Label>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map(p => (
              <SelectItem key={p.id} value={p.id}>
                <div className="flex items-center gap-2"><p.icon className="w-4 h-4" /> {p.label}</div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Name</Label>
        <Input placeholder="e.g. Personal GitHub" required value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>URL</Label>
        <Input type="url" placeholder="https://..." required value={url} onChange={e => setUrl(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Description (Optional)</Label>
        <Input placeholder="Main development account" value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Saving..." : "Save Service"}
      </Button>
    </form>
  );
}
