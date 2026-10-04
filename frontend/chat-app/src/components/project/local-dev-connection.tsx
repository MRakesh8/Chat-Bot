import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { apiUrl } from "@/lib/api-url";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Laptop,
  Globe,
  Terminal,
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  StopCircle,
  Play,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Info,
  Layers,
  Code2,
  Network,
  Sparkles,
  RefreshCw,
  Rocket,
  Check,
  AlertTriangle,
  RotateCcw
} from "lucide-react";

interface LocalDevConnectionProps {
  projectId: string;
}

export function LocalDevConnection({ projectId }: LocalDevConnectionProps) {
  const { toast } = useToast();
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"local" | "readiness" | "go-live">("local");
  const [localUrlInput, setLocalUrlInput] = useState("http://localhost:3000");
  const [prodUrlInput, setProdUrlInput] = useState("");
  const [confirmGoLiveOpen, setConfirmGoLiveOpen] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedConnector, setCopiedConnector] = useState(false);
  const [copiedDevUrl, setCopiedDevUrl] = useState(false);
  const [copiedProdSnippet, setCopiedProdSnippet] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [prodUrlError, setProdUrlError] = useState<string | null>(null);

  // Fetch local development session & status
  const { data: localDevData, isLoading: isLocalDevLoading, refetch: refetchLocalDev } = useQuery({
    queryKey: ["project-local-dev", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/local-dev`));
      if (!res.ok) {
        throw new Error("Failed to fetch local development session");
      }
      return res.json();
    },
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  // Fetch Backend Production Readiness Check
  const { data: readinessData, isLoading: isReadinessLoading, refetch: refetchReadiness } = useQuery({
    queryKey: ["project-readiness", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/go-live/readiness`));
      if (!res.ok) {
        throw new Error("Failed to fetch production readiness status");
      }
      return res.json();
    },
    enabled: !!projectId,
  });

  // Client-side Safe URL Validation for Localhost
  const validateLocalUrlClient = (url: string) => {
    if (!url.trim()) {
      setUrlError("Local website URL is required.");
      return false;
    }
    if (!/^https?:\/\//i.test(url.trim())) {
      setUrlError("URL must start with http:// or https://");
      return false;
    }
    try {
      const parsed = new URL(url.trim());
      const host = parsed.hostname.toLowerCase();
      if (host === "169.254.169.254" || host.includes("metadata.google.internal")) {
        setUrlError("Cloud metadata endpoints are strictly prohibited.");
        return false;
      }
      if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) {
        setUrlError("Private network IP addresses (e.g. 192.168.x.x) are not permitted as localhost URLs.");
        return false;
      }
      const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host.endsWith(".localhost");
      if (!isLocalHost) {
        setUrlError("URL must target localhost or 127.0.0.1 (e.g. http://localhost:3000)");
        return false;
      }
      if (parsed.port) {
        const port = parseInt(parsed.port, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          setUrlError("Port must be between 1 and 65535");
          return false;
        }
      }
      setUrlError(null);
      return true;
    } catch {
      setUrlError("Invalid URL format");
      return false;
    }
  };

  // Client-side Safe URL Validation for Production
  const validateProdUrlClient = (url: string) => {
    if (!url.trim()) {
      setProdUrlError("Production website URL is required.");
      return false;
    }
    if (!/^https?:\/\//i.test(url.trim())) {
      setProdUrlError("URL must start with https:// or http:// (e.g. https://abc-business.com)");
      return false;
    }
    try {
      const parsed = new URL(url.trim());
      const host = parsed.hostname.toLowerCase();
      if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) {
        setProdUrlError("Localhost URLs are for Local Development. Enter a public production URL.");
        return false;
      }
      if (host === "169.254.169.254" || host.includes("metadata.google.internal")) {
        setProdUrlError("Cloud metadata endpoints are strictly prohibited.");
        return false;
      }
      if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) {
        setProdUrlError("Private network IP addresses are not permitted as production URLs.");
        return false;
      }
      if (!host.includes(".")) {
        setProdUrlError("Please enter a valid top-level domain (e.g. https://abc-business.com)");
        return false;
      }
      setProdUrlError(null);
      return true;
    } catch {
      setProdUrlError("Invalid URL format");
      return false;
    }
  };

  // Connect Local Website Mutation
  const connectMutation = useMutation({
    mutationFn: async (urlToConnect: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/local-dev/connect`), {
        method: "POST",
        body: JSON.stringify({ localUrl: urlToConnect }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to connect local website");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Local Website Connected",
        description: `Ready for pre-production testing on ${localUrlInput}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["project-local-dev", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-readiness", projectId] });
      refetchLocalDev();
    },
    onError: (err: any) => {
      toast({
        title: "Connection Failed",
        description: err.message || "Could not connect local website",
        variant: "destructive",
      });
    },
  });

  // Create Temporary Development Connection Mutation
  const createTunnelMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/local-dev/tunnel`), {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create temporary development connection");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Temporary Development Connection Created",
        description: "Valid for 30 minutes. Run the local connector command to start relaying.",
      });
      queryClient.invalidateQueries({ queryKey: ["project-local-dev", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-readiness", projectId] });
      refetchLocalDev();
    },
    onError: (err: any) => {
      toast({
        title: "Connector Setup Failed",
        description: err.message || "Could not create temporary development connection",
        variant: "destructive",
      });
    },
  });

  // Run Local Website Discovery Crawl Mutation
  const discoverMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/local-dev/discover`), {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to run local website discovery");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Discovery Complete",
        description: "Local website knowledge sources ingested for testing without modifying production.",
      });
      queryClient.invalidateQueries({ queryKey: ["project-local-dev", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-sources", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-readiness", projectId] });
      refetchLocalDev();
    },
    onError: (err: any) => {
      toast({
        title: "Discovery Failed",
        description: err.message || "Could not discover local website",
        variant: "destructive",
      });
    },
  });

  // Stop Local Testing Mutation
  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/local-dev/stop`), {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Failed to stop local testing session");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Local Testing Stopped",
        description: "Local session stopped. Production configuration remains untouched.",
      });
      queryClient.invalidateQueries({ queryKey: ["project-local-dev", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-readiness", projectId] });
      refetchLocalDev();
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message || "Failed to stop session",
        variant: "destructive",
      });
    },
  });

  // Go Live Mutation (Transitions SAME project to LIVE PRODUCTION)
  const goLiveMutation = useMutation({
    mutationFn: async (productionUrlToUse: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/go-live`), {
        method: "POST",
        body: JSON.stringify({ productionUrl: productionUrlToUse }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to activate Go Live");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "🚀 Project is LIVE!",
        description: `Your NOVA chatbot is now active on ${data.productionWebsiteUrl}.`,
      });
      setConfirmGoLiveOpen(false);
      queryClient.invalidateQueries({ queryKey: ["project-local-dev", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-readiness", projectId] });
      queryClient.invalidateQueries({ queryKey: ["widget-settings", projectId] });
      refetchLocalDev();
      refetchReadiness();
      setActiveTab("go-live");
    },
    onError: (err: any) => {
      toast({
        title: "Go Live Failed",
        description: err.message || "Could not activate production deployment",
        variant: "destructive",
      });
    },
  });

  // Rollback Mutation
  const rollbackMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/go-live/rollback`), {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to rollback project status");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Project Status Updated",
        description: "Project reverted to development mode.",
      });
      queryClient.invalidateQueries({ queryKey: ["project-local-dev", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-readiness", projectId] });
      refetchLocalDev();
      refetchReadiness();
    },
    onError: (err: any) => {
      toast({
        title: "Rollback Failed",
        description: err.message || "Could not rollback status",
        variant: "destructive",
      });
    },
  });

  const handleConnect = () => {
    if (validateLocalUrlClient(localUrlInput)) {
      connectMutation.mutate(localUrlInput.trim());
    }
  };

  const handleGoLiveSubmit = () => {
    const targetUrl = prodUrlInput.trim() || localDevData?.productionWebsiteUrl;
    if (validateProdUrlClient(targetUrl)) {
      goLiveMutation.mutate(targetUrl);
    }
  };

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "https://chatbot-rakesh.vercel.app";
  const widgetUrl = `${currentOrigin}/widget.js`;
  const backendUrl = apiUrl("").replace(/\/+$/, "");
  const widgetToken = localDevData?.widgetToken || "YOUR_WIDGET_TOKEN";

  const embedSnippet = `<script
  src="${widgetUrl}"
  data-widget-token="${widgetToken}"
  data-api-url="${backendUrl}">
</script>`;

  const copySnippet = () => {
    navigator.clipboard.writeText(embedSnippet);
    setCopiedSnippet(true);
    toast({ title: "Widget snippet copied to clipboard!" });
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const copyProdSnippet = () => {
    navigator.clipboard.writeText(embedSnippet);
    setCopiedProdSnippet(true);
    toast({ title: "Production widget snippet copied!" });
    setTimeout(() => setCopiedProdSnippet(false), 2000);
  };

  const copyConnectorCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedConnector(true);
    toast({ title: "Connector command copied to clipboard!" });
    setTimeout(() => setCopiedConnector(false), 2000);
  };

  const copyDevUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedDevUrl(true);
    toast({ title: "Development URL copied to clipboard!" });
    setTimeout(() => setCopiedDevUrl(false), 2000);
  };

  const session = localDevData?.session;
  const isConnected = session?.status === "CONNECTED" || session?.status === "READY" || session?.status === "TESTING";
  const hasDevUrl = !!session?.developmentUrl;
  const isProductionLive = !!localDevData?.productionWebsiteUrl && (readinessData?.status === "active" || readinessData?.environment === "PRODUCTION");

  return (
    <Card className="bg-card border-border shadow-xs overflow-hidden">
      <CardHeader className="border-b border-border bg-muted/20 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" /> Lifecycle: Local Development → Ready → Go Live → Production
              </CardTitle>
              <Badge variant="outline" className="text-[10px] font-mono">
                Project ID: {projectId.slice(0, 8)}...
              </Badge>
            </div>
            <CardDescription className="text-xs mt-1">
              Develop & test on localhost, verify production readiness, and activate Go Live on the <strong>SAME NOVA project</strong>.
            </CardDescription>
          </div>

          {/* 3-Stage Stepper Navigation */}
          <div className="flex items-center bg-muted p-1 rounded-xl border border-border shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("local")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === "local"
                  ? "bg-card text-foreground shadow-xs border border-border font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Laptop className="w-3.5 h-3.5" /> 1. Localhost Testing
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab("readiness"); refetchReadiness(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === "readiness"
                  ? "bg-card text-foreground shadow-xs border border-border font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-500" /> 2. Readiness Check
              {readinessData && (
                <span className={`w-2 h-2 rounded-full ${readinessData.isReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("go-live")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === "go-live"
                  ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                  : isProductionLive 
                    ? "text-emerald-600 font-medium hover:text-emerald-700" 
                    : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Rocket className="w-3.5 h-3.5" /> {isProductionLive ? "3. Live Production" : "3. Go Live"}
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* STAGE 1: LOCAL DEVELOPMENT & PRE-PRODUCTION TESTING */}
        {activeTab === "local" && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Test your NOVA chatbot on your website before going live.
                </p>
                <p className="text-xs text-muted-foreground">
                  Run your business website locally on your computer and verify the complete customer experience (Launcher → Chatbot → AI/RAG → Streaming) with strict production isolation.
                </p>
                <div className="pt-1 flex items-center gap-2">
                  <Badge className="bg-blue-500 text-white font-mono text-[10px] uppercase">
                    ENVIRONMENT: LOCAL DEVELOPMENT
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    Production settings remain safely isolated and untouched.
                  </span>
                </div>
              </div>
            </div>

            {/* Step 1: Start Website Locally */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <h4 className="text-sm font-semibold text-foreground">Start your website locally</h4>
              </div>
              <p className="text-xs text-muted-foreground ml-8">
                Your business website must already be running on your computer. Common commands based on your framework:
              </p>
              <div className="ml-8 grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <div className="p-2.5 rounded-lg bg-muted/60 border border-border text-xs font-mono">
                  <span className="text-[10px] text-muted-foreground uppercase block font-sans font-semibold">Next.js</span>
                  npm run dev
                </div>
                <div className="p-2.5 rounded-lg bg-muted/60 border border-border text-xs font-mono">
                  <span className="text-[10px] text-muted-foreground uppercase block font-sans font-semibold">Vite / React</span>
                  npm run dev
                </div>
                <div className="p-2.5 rounded-lg bg-muted/60 border border-border text-xs font-mono">
                  <span className="text-[10px] text-muted-foreground uppercase block font-sans font-semibold">Create React App</span>
                  npm start
                </div>
              </div>
            </div>

            {/* Step 2: Enter Local Website URL */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <h4 className="text-sm font-semibold text-foreground">Enter Local Website URL</h4>
              </div>
              <p className="text-xs text-muted-foreground ml-8">
                Enter your local development URL (port is determined by your local server):
              </p>
              <div className="ml-8 space-y-2">
                <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                  <div className="flex-1 relative">
                    <Input
                      value={localUrlInput}
                      onChange={(e) => {
                        setLocalUrlInput(e.target.value);
                        validateLocalUrlClient(e.target.value);
                      }}
                      placeholder="http://localhost:3000"
                      className="font-mono text-sm bg-muted/50 border-border h-10"
                    />
                  </div>
                  <Button
                    onClick={handleConnect}
                    disabled={connectMutation.isPending || !!urlError}
                    className="gap-2 h-10 shrink-0"
                  >
                    {connectMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Connect Local Website
                  </Button>
                </div>
                {urlError && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {urlError}
                  </p>
                )}
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>Examples:</span>
                  <button
                    type="button"
                    onClick={() => { setLocalUrlInput("http://localhost:3000"); setUrlError(null); }}
                    className="hover:underline text-primary font-mono"
                  >
                    http://localhost:3000
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => { setLocalUrlInput("http://localhost:5173"); setUrlError(null); }}
                    className="hover:underline text-primary font-mono"
                  >
                    http://localhost:5173
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => { setLocalUrlInput("http://localhost:3001"); setUrlError(null); }}
                    className="hover:underline text-primary font-mono"
                  >
                    http://localhost:3001
                  </button>
                </div>
              </div>
            </div>

            {/* Session Status & Stop Button */}
            {session && (
              <div className="ml-8 p-4 rounded-xl bg-card border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Testing Session Status:</span>
                    <Badge
                      className={
                        isConnected
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {session.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    Target: {session.localUrl} • Expires: {session.expiresAt ? new Date(session.expiresAt).toLocaleTimeString() : "30m"}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/10"
                    onClick={() => window.open(session.localUrl, "_blank")}
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open Local Website
                  </Button>
                  {isConnected && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => stopMutation.mutate()}
                      disabled={stopMutation.isPending}
                    >
                      {stopMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
                      Stop Local Testing
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Outbound Bridge Connector */}
            <div className="ml-8 p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-purple-500" />
                  <h4 className="text-sm font-semibold text-foreground">Secure Localhost Development Connector</h4>
                </div>
                <Badge
                  className={
                    hasDevUrl
                      ? session?.isBridgeConnected 
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" 
                        : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {hasDevUrl 
                    ? (session?.isBridgeConnected ? "CONNECTOR LIVE" : "WAITING FOR CONNECTOR") 
                    : "NOT CONNECTED"}
                </Badge>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Relays website discovery requests from NOVA Cloud to your local website via an outbound TLS bridge. No open router ports or third-party accounts required.
              </p>

              {!hasDevUrl ? (
                <Button
                  onClick={() => createTunnelMutation.mutate()}
                  disabled={createTunnelMutation.isPending}
                  size="sm"
                  className="gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs"
                >
                  {createTunnelMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  Create Temporary Development URL
                </Button>
              ) : (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                      Temporary Development URL (30 Min Expiry)
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={session.developmentUrl || ""}
                        className="font-mono text-xs bg-muted/60 h-8"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1 shrink-0"
                        onClick={() => copyDevUrl(session.developmentUrl || "")}
                      >
                        {copiedDevUrl ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedDevUrl ? "Copied" : "Copy URL"}
                      </Button>
                    </div>
                  </div>

                  {session.connectorCommand && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                        Run On Your Laptop
                      </label>
                      <div className="relative">
                        <pre className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs font-mono overflow-x-auto pr-24">
                          {session.connectorCommand}
                        </pre>
                        <Button
                          size="sm"
                          variant="outline"
                          className="absolute top-2 right-2 bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white text-[11px] h-7 gap-1"
                          onClick={() => copyConnectorCommand(session.connectorCommand!)}
                        >
                          {copiedConnector ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          {copiedConnector ? "Copied" : "Copy Command"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => discoverMutation.mutate()}
                      disabled={discoverMutation.isPending || !session.isBridgeConnected}
                      className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {discoverMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Scan Local Website Intelligence
                    </Button>
                    {!session.isBridgeConnected && (
                      <span className="text-[11px] text-amber-500 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Start local connector on your machine to enable discovery
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Local Chatbot Installation */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                  3
                </span>
                <h4 className="text-sm font-semibold text-foreground">Local Chatbot Installation</h4>
              </div>
              <p className="text-xs text-muted-foreground ml-8">
                Add this integration snippet to your local website's HTML before the closing <code>&lt;/body&gt;</code> tag:
              </p>
              <div className="ml-8 relative">
                <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs font-mono overflow-x-auto">
                  {embedSnippet}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2.5 right-2.5 bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white text-xs gap-1.5"
                  onClick={copySnippet}
                >
                  {copiedSnippet ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSnippet ? "Copied" : "Copy Chatbot Integration"}
                </Button>
              </div>
            </div>

            {/* Next Step Banner */}
            <div className="ml-8 p-4 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Completed localhost testing?</p>
                <p className="text-xs text-muted-foreground">Proceed to production readiness verification before going live.</p>
              </div>
              <Button
                onClick={() => { setActiveTab("readiness"); refetchReadiness(); }}
                className="gap-2 text-xs"
              >
                <ShieldCheck className="w-4 h-4" /> Check Production Readiness
              </Button>
            </div>
          </div>
        )}

        {/* STAGE 2: PRODUCTION READINESS CHECKLIST */}
        {activeTab === "readiness" && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-card border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">Production Readiness Evaluation</h3>
                  {readinessData && (
                    <Badge
                      className={
                        readinessData.isReady
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                      }
                    >
                      {readinessData.overallStatus}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Backend-driven verification across security, widget config, AI reasoning, and website testing.
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchReadiness()}
                disabled={isReadinessLoading}
                className="gap-1.5 text-xs self-start sm:self-auto"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReadinessLoading ? 'animate-spin' : ''}`} />
                Re-evaluate
              </Button>
            </div>

            {isReadinessLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-3">
                {readinessData?.checks?.map((chk: any) => (
                  <div
                    key={chk.id}
                    className={`p-4 rounded-xl border flex items-start gap-3 transition-colors ${
                      chk.status === "pass"
                        ? "bg-card border-border"
                        : chk.status === "warn"
                        ? "bg-amber-500/5 border-amber-500/20"
                        : "bg-destructive/5 border-destructive/20"
                    }`}
                  >
                    {chk.status === "pass" && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />}
                    {chk.status === "warn" && <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
                    {chk.status === "fail" && <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />}

                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">{chk.name}</p>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            chk.status === "pass"
                              ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/5"
                              : chk.status === "warn"
                              ? "text-amber-500 border-amber-500/20 bg-amber-500/5"
                              : "text-destructive border-destructive/20 bg-destructive/5"
                          }`}
                        >
                          {chk.status.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{chk.message}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{chk.detail}</p>
                    </div>
                  </div>
                ))}

                <div className="p-4 rounded-xl bg-muted/40 border border-border flex items-center justify-between pt-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {readinessData?.isReady ? "All critical checks passed!" : "Please resolve blocking items."}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {readinessData?.isReady 
                        ? "You are ready to activate Go Live on your production website."
                        : "Review failed items before launching live to production."}
                    </p>
                  </div>
                  <Button
                    onClick={() => setActiveTab("go-live")}
                    disabled={!readinessData?.isReady}
                    className="gap-2 text-xs bg-primary text-primary-foreground"
                  >
                    <Rocket className="w-4 h-4" /> Proceed to Go Live
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STAGE 3: GO LIVE / LIVE PRODUCTION */}
        {activeTab === "go-live" && (
          <div className="space-y-6">
            {isProductionLive ? (
              /* LIVE PRODUCTION STATE */
              <div className="space-y-6">
                <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500 text-white shrink-0">
                      <Rocket className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-foreground">Chatbot is LIVE in Production</h4>
                        <Badge className="bg-emerald-500 text-white text-[10px]">LIVE PRODUCTION</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Production Domain: <strong className="text-foreground">{localDevData?.productionWebsiteUrl}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => window.open(localDevData?.productionWebsiteUrl, "_blank")}
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Visit Production Website
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                      onClick={() => rollbackMutation.mutate()}
                      disabled={rollbackMutation.isPending}
                    >
                      {rollbackMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Rollback to Dev
                    </Button>
                  </div>
                </div>

                {/* Production Embed Snippet */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Production Chatbot Snippet</h4>
                    <span className="text-xs text-muted-foreground font-mono">SAME Project ID: {projectId}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ensure this script is embedded on your production site before the closing <code>&lt;/body&gt;</code> tag:
                  </p>
                  <div className="relative">
                    <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs font-mono overflow-x-auto">
                      {embedSnippet}
                    </pre>
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute top-2.5 right-2.5 bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white text-xs gap-1.5"
                      onClick={copyProdSnippet}
                    >
                      {copiedProdSnippet ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedProdSnippet ? "Copied" : "Copy Snippet"}
                    </Button>
                  </div>
                </div>

                {/* Production Isolation & Continuity Notice */}
                <div className="p-4 rounded-xl bg-card border border-border space-y-2">
                  <h5 className="text-xs font-semibold text-muted-foreground uppercase">Environment Isolation Rules</h5>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Local development sessions and connector expiration do NOT affect production.</li>
                    <li>• Production domain is protected by strict origin validation and CORS security.</li>
                    <li>• Knowledge sources and AI prompt configurations are shared seamlessly across environments.</li>
                  </ul>
                </div>
              </div>
            ) : (
              /* GO LIVE TRANSITION FORM */
              <div className="space-y-6">
                <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-start gap-3">
                  <Rocket className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      Activate Production Go Live on the SAME Project
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Moving from localhost to production does <strong>not</strong> require creating a new project. Your knowledge base, widget token, and AI configuration remain identical.
                    </p>
                  </div>
                </div>

                {/* Production URL Input */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Enter Production Website URL
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                    <Input
                      value={prodUrlInput}
                      onChange={(e) => {
                        setProdUrlInput(e.target.value);
                        validateProdUrlClient(e.target.value);
                      }}
                      placeholder="https://abc-business.com"
                      className="font-mono text-sm bg-muted/50 border-border h-10"
                    />
                    <Button
                      onClick={() => setConfirmGoLiveOpen(true)}
                      disabled={goLiveMutation.isPending || !!prodUrlError || !prodUrlInput.trim()}
                      className="gap-2 h-10 shrink-0 bg-primary text-primary-foreground font-semibold"
                    >
                      {goLiveMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Rocket className="w-4 h-4" />
                      )}
                      Go Live
                    </Button>
                  </div>
                  {prodUrlError && (
                    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {prodUrlError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Example: <code>https://mybusiness.com</code> or <code>https://app.mycompany.io</code>
                  </p>
                </div>

                {/* Explicit Confirmation Dialog / Modal Card */}
                {confirmGoLiveOpen && (
                  <div className="p-5 rounded-xl bg-card border-2 border-primary/50 shadow-md space-y-4 animate-in fade-in-50">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                      <h4 className="text-sm font-bold text-foreground">Confirm Production Go Live</h4>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      "Your NOVA chatbot will now be activated for your production website (<strong>{prodUrlInput.trim()}</strong>). The same Project ID, knowledge base, and widget token will be deployed to live production."
                    </p>
                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        size="sm"
                        onClick={handleGoLiveSubmit}
                        disabled={goLiveMutation.isPending}
                        className="gap-2 text-xs bg-primary text-primary-foreground"
                      >
                        {goLiveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                        Confirm & Go Live
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmGoLiveOpen(false)}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
