import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Github, Linkedin, ExternalLink, Copy, Edit2, Trash2, 
  MoreVertical, Plus, Box, Database, BarChart3, LineChart, 
  Search, Play, Globe, ChevronDown, ChevronUp, Zap, 
  ShieldCheck, Layers, Sparkles, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api-url";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { cn } from "@/lib/utils";

export type Service = {
  id: string;
  provider: string;
  name: string;
  url: string;
  description: string | null;
  status: string;
};

export type ProviderOption = {
  id: string;
  label: string;
  icon: any;
  category: string;
};

export const PROVIDERS: ProviderOption[] = [
  { id: "github", label: "GitHub", icon: Github, category: "Development" },
  { id: "vercel", label: "Vercel", icon: Globe, category: "Development" },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin, category: "Other" },
  { id: "render", label: "Render Dashboard", icon: Box, category: "Monitoring" },
  { id: "uptime_robot", label: "UptimeRobot", icon: Activity, category: "Monitoring" },
  { id: "supabase", label: "Supabase", icon: Database, category: "Databases" },
  { id: "microsoft_clarity", label: "Microsoft Clarity", icon: BarChart3, category: "AI & Analytics" },
  { id: "google_analytics", label: "Google Analytics", icon: LineChart, category: "AI & Analytics" },
  { id: "google_search_console", label: "Search Console", icon: Search, category: "AI & Analytics" },
  { id: "google_ai_studio", label: "Google AI Studio", icon: Sparkles, category: "AI & Analytics" },
  { id: "youtube", label: "YouTube", icon: Play, category: "Other" },
  { id: "custom", label: "Custom Service", icon: Globe, category: "Other" },
];

export const SERVICE_CATEGORIES = [
  "All Services",
  "AI & Analytics",
  "Databases",
  "Development",
  "Monitoring",
  "Other",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export function getServiceCategory(providerId: string): string {
  const found = PROVIDERS.find((p) => p.id === providerId);
  if (found) return found.category;
  const p = (providerId || "").toLowerCase();
  if (p.includes("analytics") || p.includes("clarity") || p.includes("ai")) return "AI & Analytics";
  if (p.includes("database") || p.includes("sql") || p.includes("db") || p.includes("supabase")) return "Databases";
  if (p.includes("git") || p.includes("dev") || p.includes("code") || p.includes("vercel")) return "Development";
  if (p.includes("monitor") || p.includes("uptime") || p.includes("status") || p.includes("render")) return "Monitoring";
  return "Other";
}

export default function ConnectedServicesPage() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory>("All Services");
  const [searchQuery, setSearchQuery] = useState("");

  const { session, activeOrganizationId } = useAuth();
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: services = [], isLoading, isError, error, refetch, isFetching } = useQuery<Service[]>({
    queryKey: ["connectedServices", activeOrganizationId],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/services"));
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || `Server responded with status ${res.status}`);
      }
      return res.json();
    },
    enabled: !!session,
  });

  const addMutation = useMutation({
    mutationFn: async (data: Partial<Service>) => {
      const res = await authFetch(apiUrl("/api/services"), {
        method: "POST",
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
      const res = await authFetch(apiUrl(`/api/services/${id}`), {
        method: "PUT",
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
      const res = await authFetch(apiUrl(`/api/services/${id}`), {
        method: "DELETE",
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

  const getCategoryCount = (category: ServiceCategory) => {
    if (category === "All Services") return services.length;
    return services.filter((s) => getServiceCategory(s.provider) === category).length;
  };

  const filteredServices = useMemo(() => {
    return services.filter((service) => {
      const matchesCategory =
        selectedCategory === "All Services" ||
        getServiceCategory(service.provider) === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        service.name.toLowerCase().includes(q) ||
        service.provider.toLowerCase().includes(q) ||
        (service.description && service.description.toLowerCase().includes(q)) ||
        service.url.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [services, selectedCategory, searchQuery]);

  return (
    <div className="flex w-full h-full bg-transparent overflow-x-hidden">
      <div className="flex-1 p-6 md:p-8 text-foreground max-w-6xl mx-auto space-y-8">
        {/* Header Banner */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                  Platform Integrations
                </Badge>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                Connected Services
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Integrate your favorite tools and platforms to extend NOVA AI's capabilities.
              </p>
            </div>

            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground h-10 px-5 font-semibold text-xs shadow-md transition-all">
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

          {/* Benefits Feature Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-border/50">
            <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/80 shadow-2xs">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-foreground">Quick & Easy Setup</h4>
                <p className="text-[11px] text-muted-foreground">Instant API & webhook access</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/80 shadow-2xs">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-foreground">Secure Connections</h4>
                <p className="text-[11px] text-muted-foreground">Encrypted token credentials</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/80 shadow-2xs">
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-foreground">More Capabilities</h4>
                <p className="text-[11px] text-muted-foreground">Automated workflow triggers</p>
              </div>
            </div>
          </div>
        </div>

        {/* Category Filter & Search Bar */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
              {SERVICE_CATEGORIES.map((cat) => {
                const count = getCategoryCount(cat);
                const isActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                        : "bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/50"
                    )}
                  >
                    <span>{cat}</span>
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                        isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72 shrink-0">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search connected services..."
                className="pl-9 pr-8 h-9 rounded-xl bg-secondary/50 border-border/60 text-xs focus:ring-primary/40"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Services Content Area */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-xs font-medium">Loading connected services...</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center border border-dashed border-red-500/20 rounded-2xl bg-red-500/5">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Globe className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <p className="text-foreground font-semibold mb-1 text-sm">Failed to load services</p>
              <p className="text-muted-foreground text-xs max-w-sm">
                {(error as Error)?.message || "Could not connect to the server."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-2 rounded-xl text-xs"
            >
              {isFetching ? "Retrying..." : "Retry Connection"}
            </Button>
          </div>
        ) : services.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-3xl bg-card/20 backdrop-blur-xl space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
              <Globe className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-foreground">No Services Connected Yet</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Connect your external tools, APIs, analytics platforms, and hosting services to streamline your NOVA AI workspace integrations.
              </p>
            </div>
            <Button
              onClick={() => setIsAddOpen(true)}
              className="gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs h-10 px-5 shadow-md"
            >
              <Plus className="w-4 h-4" /> Add Your First Service
            </Button>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-2xl bg-card/30 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-muted border border-border flex items-center justify-center text-muted-foreground">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-0.5">No matching services found</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                No connected services match "{searchQuery}" in "{selectedCategory}".
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedCategory("All Services");
                setSearchQuery("");
              }}
              className="rounded-xl text-xs mt-2"
            >
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredServices.map((service) => {
              const ProviderIcon = PROVIDERS.find((p) => p.id === service.provider)?.icon || Globe;
              return (
                <ServiceCard
                  key={service.id}
                  service={service}
                  ProviderIcon={ProviderIcon}
                  onOpen={handleOpenUrl}
                  onCopy={handleCopyUrl}
                  onEdit={() => { setEditingService(service); setIsEditOpen(true); }}
                  onDelete={() => deleteMutation.mutate(service.id)}
                />
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
        <Label className="text-xs">Provider</Label>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="rounded-xl text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {PROVIDERS.map(p => (
              <SelectItem key={p.id} value={p.id} className="text-xs rounded-lg my-0.5">
                <div className="flex items-center gap-2"><p.icon className="w-4 h-4 text-primary" /> {p.label}</div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Name</Label>
        <Input placeholder="e.g. Production GitHub Repo" required value={name} onChange={e => setName(e.target.value)} className="rounded-xl text-xs" />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">URL</Label>
        <Input type="url" placeholder="https://..." required value={url} onChange={e => setUrl(e.target.value)} className="rounded-xl text-xs" />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Description (Optional)</Label>
        <Input placeholder="Main integration endpoint" value={description} onChange={e => setDescription(e.target.value)} className="rounded-xl text-xs" />
      </div>
      <Button type="submit" className="w-full rounded-xl text-xs font-semibold" disabled={isPending}>
        {isPending ? "Saving..." : "Save Service"}
      </Button>
    </form>
  );
}

function ServiceCard({ service, ProviderIcon, onOpen, onCopy, onEdit, onDelete }: any) {
  const [expanded, setExpanded] = useState(false);
  const category = getServiceCategory(service.provider);

  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-xs hover:shadow-lg hover:border-primary/30 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden h-full">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* Top Header */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-4 relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 bg-primary/10 rounded-2xl shadow-inner border border-primary/20 text-primary shrink-0 group-hover:scale-105 transition-transform duration-300">
              <ProviderIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-foreground text-base leading-snug truncate" title={service.name}>
                  {service.name}
                </h3>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-primary/5 text-primary border-primary/20 rounded-md font-semibold">
                  {category}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-lg border border-emerald-400/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Connected</span>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl hover:bg-foreground/10">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl p-1.5 z-50">
                <DropdownMenuItem onClick={() => onOpen(service.url)} className="rounded-xl text-xs py-2 hover:bg-accent cursor-pointer flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-primary" /> Open Link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onCopy(service.url)} className="rounded-xl text-xs py-2 hover:bg-accent cursor-pointer flex items-center gap-2">
                  <Copy className="w-4 h-4 text-indigo-400" /> Copy URL
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onEdit} className="rounded-xl text-xs py-2 hover:bg-accent cursor-pointer flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-slate-400" /> Edit Service
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="rounded-xl text-xs py-2 text-rose-500 hover:bg-rose-500/10 focus:bg-rose-500/10 focus:text-rose-600 cursor-pointer flex items-center gap-2 font-medium">
                  <Trash2 className="w-4 h-4" /> Delete Service
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* URL Display */}
        <div className="mb-4">
          <p className="text-xs font-mono text-muted-foreground/80 truncate bg-secondary/40 border border-border/50 rounded-xl px-3 py-1.5" title={service.url}>
            {service.url}
          </p>
        </div>

        {/* Description */}
        {service.description && (
          <div className="relative mb-5 z-10 bg-muted/30 rounded-xl border border-border/60 overflow-hidden flex flex-col">
            <div className={`p-3 text-xs text-foreground/80 overflow-y-auto custom-scrollbar transition-all duration-300 ${expanded ? 'max-h-[180px]' : 'max-h-[70px] line-clamp-2'} whitespace-pre-wrap`}>
              {service.description}
            </div>

            {service.description.length > 90 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full py-1 flex items-center justify-center gap-1 bg-secondary/50 hover:bg-secondary text-[11px] text-muted-foreground hover:text-foreground transition-colors border-t border-border/40 font-medium cursor-pointer"
              >
                {expanded ? (
                  <>Show less <ChevronUp className="w-3 h-3" /></>
                ) : (
                  <>Read more <ChevronDown className="w-3 h-3" /></>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-4 border-t border-border/50 relative z-10 mt-auto">
        <Button
          size="sm"
          variant="outline"
          onClick={onEdit}
          className="h-9 px-3 rounded-xl border-border/80 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary gap-1.5 cursor-pointer"
          title="Edit Service"
        >
          <Edit2 className="w-3.5 h-3.5" />
          <span>Edit</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => onCopy(service.url)}
          className="h-9 w-9 p-0 rounded-xl border-border/80 text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center shrink-0 cursor-pointer"
          title="Copy URL"
        >
          <Copy className="w-3.5 h-3.5" />
        </Button>

        <Button
          size="sm"
          onClick={() => onOpen(service.url)}
          className="h-9 px-4 rounded-xl gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold ml-auto shadow-sm cursor-pointer"
        >
          <span>Open</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
