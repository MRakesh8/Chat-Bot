import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Deployment } from "./deployment";
import {
  Sparkles,
  Globe,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Activity,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  Search,
  Check
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  { id: 1, label: "Connect", icon: Globe },
  { id: 2, label: "Analysis", icon: Activity },
  { id: 3, label: "Intelligence", icon: Search },
  { id: 4, label: "Install Agent", icon: Sparkles },
];

import { useAuthFetch } from "@/hooks/use-auth-fetch";


interface OnboardingWizardProps {
  onProjectCreated?: (projectId: string, shareToken: string) => void;
}

export function OnboardingWizard({ onProjectCreated }: OnboardingWizardProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authFetch = useAuthFetch();

  const [step, setStep] = useState(1);
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  // 1. Create Project Mutation
  const createProjectMutation = useMutation({
    mutationFn: async () => {
      // Create a minimal safe default for API compatibility
      const systemPrompt = `You are an AI assistant for ${businessName}.`;
      
      const res = await authFetch(apiUrl("/api/projects"), {
        method: "POST",
        body: JSON.stringify({ name: businessName, systemPrompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to create project");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedProjectId(data.id);
      onProjectCreated?.(data.id, data.shareToken);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
      // Immediately start discovery
      startDiscoveryMutation.mutate(data.id);
    },
    onError: (err: any) => {
      toast({ title: "Project Error", description: err.message, variant: "destructive" });
    }
  });

  // 2. Start Discovery Mutation
  const startDiscoveryMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/discovery/start`), {
        method: "POST",
        body: JSON.stringify({ url: websiteUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to analyze website");
      }
      return res.json();
    },
    onSuccess: () => {
      setStep(2);
      toast({ title: "Analysis started", description: "RAGHUB is crawling the website..." });
    },
    onError: (err: any) => {
      toast({ title: "Analysis Error", description: err.message, variant: "destructive" });
    }
  });

  // 3. Polling Discovery Status
  const { data: discoveryData, error: discoveryError, refetch: refetchDiscovery } = useQuery({
    queryKey: ["discovery-status", createdProjectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${createdProjectId}/discovery/status`));
      if (!res.ok) throw new Error("Failed to fetch discovery status");
      return res.json();
    },
    enabled: !!createdProjectId && (step === 2 || step === 3),
    refetchInterval: (query) => {
      const status = query.state.data?.discoveryStatus;
      if (status === "READY" || status === "FAILED") return false;
      return 2000;
    },
  });

  // Derived state for status
  const discoveryStatus = discoveryData?.discoveryStatus;
  const isReady = discoveryStatus === "READY";
  const isFailed = discoveryStatus === "FAILED";
  const isAnalyzing = discoveryStatus === "ANALYZING" || discoveryStatus === "PENDING";

  // 4. Intelligence & Capabilities Queries
  const { data: capabilitiesData } = useQuery({
    queryKey: ["capabilities", createdProjectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${createdProjectId}/capabilities`));
      if (!res.ok) throw new Error("Failed to load capabilities");
      return res.json();
    },
    enabled: !!createdProjectId && isReady && step >= 2,
  });

  const { data: projectData } = useQuery({
    queryKey: ["admin-project", createdProjectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${createdProjectId}`));
      if (!res.ok) throw new Error("Failed to load intelligence");
      return res.json();
    },
    enabled: !!createdProjectId && isReady && step >= 2,
  });

  const intelligence = projectData?.intelligence || {};
  const capabilities = capabilitiesData?.capabilities || {};

  const handleConnect = () => {
    if (!businessName.trim() || !websiteUrl.trim()) {
      toast({ title: "Required", description: "Please enter both Business Name and URL.", variant: "destructive" });
      return;
    }
    
    // Basic frontend URL validation (backend is the true source of SSRF protection)
    if (!websiteUrl.startsWith("http://") && !websiteUrl.startsWith("https://")) {
      toast({ title: "Invalid URL", description: "URL must start with http:// or https://", variant: "destructive" });
      return;
    }

    createProjectMutation.mutate();
  };

  const handleReanalyze = () => {
    if (!createdProjectId) return;
    startDiscoveryMutation.mutate(createdProjectId);
  };

  const goToEditor = () => {
    if (createdProjectId) {
      setLocation(`/projects/${createdProjectId}/edit`);
    }
  };

  const progressValue = (step / STEPS.length) * 100;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-sm font-medium px-4 py-2 rounded-full mb-4">
            <Sparkles className="w-4 h-4" />
            AI Business Agent Setup
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-foreground to-foreground/70 tracking-tight mb-3">
            {step === 1 && "Connect your website"}
            {step === 2 && "RAGHUB analyzes your website"}
            {step === 3 && "Business Intelligence"}
            {step === 4 && "Install your AI Agent"}
          </h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            {step === 1 && "Enter your website URL and we'll automatically understand your business and discover capabilities."}
            {step === 2 && "We are scanning the website structure to prepare the agent."}
            {step === 3 && "Here is what we discovered. Business integrations can be connected later."}
            {step === 4 && "Add this code to your website to deploy the agent."}
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isDone = step > s.id;
            const isActive = step === s.id;
            return (
              <div key={s.id} className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-300 ${
                    isDone
                      ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                      : isActive
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-foreground/5 text-muted-foreground border border-foreground/10"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-4 md:w-8 h-px ${step > s.id ? "bg-emerald-500/50" : "bg-foreground/10"}`} />
                )}
              </div>
            );
          })}
        </div>

        <Progress value={progressValue} className="h-1 mb-8 bg-foreground/10" />

        {/* --- STEP 1: Connect --- */}
        {step === 1 && (
          <div className="bg-card border border-border rounded-2xl p-6 md:p-8 space-y-6 shadow-sm">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Business Name</label>
              <Input
                placeholder="e.g. Acme Corp"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="h-12 rounded-xl bg-background border-border focus:border-primary/50"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Website URL</label>
              <Input
                placeholder="https://example.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                className="h-12 rounded-xl bg-background border-border focus:border-primary/50"
              />
            </div>
            <Button
              onClick={handleConnect}
              disabled={createProjectMutation.isPending || !businessName.trim() || !websiteUrl.trim()}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground gap-2 font-medium"
            >
              {createProjectMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
              ) : (
                <>Analyze Website <ArrowRight className="w-4 h-4" /></>
              )}
            </Button>
          </div>
        )}

        {/* --- STEP 2: Analysis Polling --- */}
        {step === 2 && (
          <div className="bg-card border border-border rounded-2xl p-6 md:p-8 space-y-6 shadow-sm">
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-background border border-border rounded-xl">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium text-sm">Website reachable</span>
                </div>
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>

              <div className="flex items-center justify-between p-4 bg-background border border-border rounded-xl">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium text-sm">Analyzing website</span>
                </div>
                {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              </div>

              <div className="flex items-center justify-between p-4 bg-background border border-border rounded-xl">
                <div className="flex items-center gap-3">
                  <Search className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium text-sm">Discovering capabilities</span>
                </div>
                {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              </div>
              
              <div className="flex items-center justify-between p-4 bg-background border border-border rounded-xl">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium text-sm">Intelligence ready</span>
                </div>
                {isAnalyzing ? <span className="text-xs text-muted-foreground">Pending</span> : <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              </div>
            </div>

            {isFailed && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-lg text-sm flex gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-semibold">Website analysis failed.</p>
                  <p className="text-xs mt-1 opacity-90">We couldn't reach the website or it returned an error. You can try again.</p>
                  <Button variant="outline" size="sm" onClick={handleReanalyze} className="mt-3 text-xs border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10">
                    <RefreshCw className="w-3 h-3 mr-2" /> Try Again
                  </Button>
                </div>
              </div>
            )}

            <Button
              onClick={() => setStep(3)}
              disabled={!isReady}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground gap-2 font-medium"
            >
              {!isReady ? (
                <>Analyzing... <Loader2 className="w-4 h-4 animate-spin" /></>
              ) : (
                <>View Intelligence <ArrowRight className="w-4 h-4" /></>
              )}
            </Button>
          </div>
        )}

        {/* --- STEP 3: Intelligence & Capabilities --- */}
        {step === 3 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            
            <div className="p-6 md:p-8 border-b border-border bg-background">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Website Knowledge Connected</h3>
                  <p className="text-sm text-muted-foreground mt-1">We have analyzed the website structure.</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleReanalyze} disabled={startDiscoveryMutation.isPending} className="h-8 text-xs shrink-0">
                  {startDiscoveryMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />} 
                  Analyze Again
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 mt-6">
                <div className="bg-foreground/[0.02] border border-border p-3 rounded-lg">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Business Type</p>
                  <p className="font-medium text-sm truncate" title={intelligence?.businessType || "Unknown"}>{intelligence?.businessType || "Unknown"}</p>
                </div>
                <div className="bg-foreground/[0.02] border border-border p-3 rounded-lg">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Platform</p>
                  <p className="font-medium text-sm truncate" title={intelligence?.platform || "Custom"}>{intelligence?.platform || "Custom"}</p>
                </div>
                <div className="bg-foreground/[0.02] border border-border p-3 rounded-lg">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Pages Found</p>
                  <p className="font-medium text-sm">{intelligence?.crawledPages?.length || 0}</p>
                </div>
                <div className="bg-foreground/[0.02] border border-border p-3 rounded-lg">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Knowledge</p>
                  <div className="flex items-center gap-1 text-sm font-medium text-emerald-500">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8 space-y-4">
              <h4 className="text-sm font-semibold text-foreground">Discovered Capabilities</h4>
              <p className="text-xs text-muted-foreground mb-4">The following features were detected on your website. Execution is not configured yet.</p>
              
              <div className="space-y-3">
                {Object.keys(capabilities).length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground border border-dashed border-border rounded-xl text-sm">
                    No specific interactive capabilities were detected on the crawled pages.
                  </div>
                ) : (
                  Object.entries(capabilities).map(([key, cap]: [string, any]) => (
                    <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-foreground/[0.02] border border-border rounded-xl gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm capitalize text-foreground">{key.replace(/_/g, ' ')}</span>
                          <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20 font-medium h-5">Detected</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Detected on your website</p>
                      </div>
                      <div className="text-left sm:text-right flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-0">
                        <span className="text-[11px] text-muted-foreground bg-foreground/5 border border-border px-2 py-0.5 rounded font-medium whitespace-nowrap">Execution not configured</span>
                        {cap.riskLevel && cap.riskLevel !== "LOW" && (
                          <span className="text-[10px] text-amber-500 sm:mt-1.5 font-medium whitespace-nowrap">Risk: {cap.riskLevel}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-6 md:p-8 border-t border-border bg-background flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={goToEditor} className="sm:w-auto h-12 rounded-xl border-border text-foreground font-medium">
                Customize Instructions
              </Button>
              <Button onClick={() => setStep(4)} className="flex-1 h-12 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground gap-2 font-medium">
                Continue to Installation <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* --- STEP 4: Installation --- */}
        {step === 4 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="text-center bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-6 md:p-8">
              <h3 className="font-semibold text-foreground mb-2 text-lg">Installation code ready! 🎉</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Add this code to your website to deploy the AI agent. You can customize its appearance in the Widget Studio afterwards.
              </p>
            </div>

            {createdProjectId && (
              <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-sm">
                <Deployment projectId={createdProjectId} />
              </div>
            )}

            <div className="flex justify-center pt-2">
              <Button onClick={goToEditor} variant="outline" className="gap-2 rounded-xl px-8 h-12 border-primary/30 hover:bg-primary/5 text-primary font-medium">
                Customize AI Agent <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
