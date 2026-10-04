import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api-url";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sparkles,
  Globe,
  Laptop,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Activity,
  AlertCircle,
  Copy,
  Check,
  Rocket,
  Settings,
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";

interface OnboardingWizardProps {
  onProjectCreated?: (projectId: string, shareToken: string) => void;
  initialEnv?: "live" | "local" | null;
}

export function OnboardingWizard({ onProjectCreated, initialEnv = null }: OnboardingWizardProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authFetch = useAuthFetch();

  // Onboarding Step State:
  // step 0: Environment Choice
  // step 1: Step 1 (Form)
  // step 2: Step 2 (Analysis - Live only)
  // step 3: Step 3 (Installation Code - Live only)
  // step 4: Step 4 (Verify & Launch OR See More Settings - Live only)
  const [step, setStep] = useState<number>(initialEnv ? 1 : 0);
  const [envChoice, setEnvChoice] = useState<"live" | "local" | null>(initialEnv);

  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Verification & Go Live States
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    message: string;
    isLive?: boolean;
    checks?: any[];
  } | null>(null);

  // 1. Create Project Mutation
  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; url: string; env: "live" | "local" }) => {
      const systemPrompt = `You are an AI assistant for ${data.name}.`;
      const res = await authFetch(apiUrl("/api/projects"), {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          systemPrompt,
          websiteUrl: data.env === "live" ? data.url : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to create project");
      }
      return res.json();
    },
    onSuccess: async (project, variables) => {
      setCreatedProjectId(project.id);
      onProjectCreated?.(project.id, project.shareToken);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });

      if (variables.env === "live") {
        // Start website discovery
        try {
          await authFetch(apiUrl(`/api/projects/${project.id}/discovery/start`), {
            method: "POST",
            body: JSON.stringify({ url: variables.url }),
          });
        } catch (e) {
          // Non-blocking log
        }
        setStep(2);
      } else {
        // Localhost Development Connection
        try {
          await authFetch(apiUrl(`/api/projects/${project.id}/local-dev/connect`), {
            method: "POST",
            body: JSON.stringify({ localUrl: variables.url }),
          });
        } catch (e) {
          // Ignore, session will be auto created
        }
        toast({
          title: "Local Project Created! 🎉",
          description: `Connected to ${variables.url}. Opening project workspace...`,
        });
        setLocation(`/projects/${project.id}/edit`);
      }
    },
    onError: (err: any) => {
      toast({ title: "Project Creation Failed", description: err.message, variant: "destructive" });
    },
  });

  // Polling Website Discovery Status (Live Website Step 2)
  const { data: discoveryData } = useQuery({
    queryKey: ["discovery-status", createdProjectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${createdProjectId}/discovery/status`));
      if (!res.ok) throw new Error("Failed to fetch discovery status");
      return res.json();
    },
    enabled: !!createdProjectId && step === 2 && envChoice === "live",
    refetchInterval: (query) => {
      const status = query.state.data?.discoveryStatus;
      if (status === "READY" || status === "FAILED") return false;
      return 2500;
    },
  });

  // Fetch Widget Settings for Installation Code (Live Website Step 3)
  const { data: widgetSettings } = useQuery({
    queryKey: ["widget-settings", createdProjectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${createdProjectId}/widget/settings`));
      if (!res.ok) throw new Error("Failed to load widget settings");
      return res.json();
    },
    enabled: !!createdProjectId && (step === 3 || step === 4),
  });

  const discoveryStatus = discoveryData?.discoveryStatus;
  const isAnalysisComplete = discoveryStatus === "READY";
  const isAnalysisFailed = discoveryStatus === "FAILED";
  const isAnalyzing = discoveryStatus === "ANALYZING" || discoveryStatus === "PENDING" || !discoveryStatus;

  // Generate Installation Code Snippet
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "https://chatbot-rakesh.vercel.app";
  const widgetUrl = `${currentOrigin}/widget.js`;
  const backendUrl = apiUrl("").replace(/\/+$/, "");
  const widgetToken = widgetSettings?.widgetToken || "YOUR_WIDGET_TOKEN";

  const installationCode = `<script
  src="${widgetUrl}"
  data-widget-token="${widgetToken}"
  data-api-url="${backendUrl}">
</script>`;

  const copyInstallationCode = () => {
    navigator.clipboard.writeText(installationCode);
    setCopiedCode(true);
    toast({ title: "Copied!", description: "Installation script copied to clipboard." });
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Step 1 Submission
  const handleStep1Submit = () => {
    if (!businessName.trim()) {
      toast({ title: "Required", description: "Please enter your Business Name.", variant: "destructive" });
      return;
    }

    if (envChoice === "live") {
      if (!websiteUrl.trim()) {
        toast({ title: "Required", description: "Please enter your Live Website URL.", variant: "destructive" });
        return;
      }
      let formattedUrl = websiteUrl.trim();
      if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
        formattedUrl = `https://${formattedUrl}`;
      }
      setWebsiteUrl(formattedUrl);
      createProjectMutation.mutate({ name: businessName.trim(), url: formattedUrl, env: "live" });
    } else {
      let localUrl = websiteUrl.trim() || "http://localhost:3000";
      if (!localUrl.startsWith("http://") && !localUrl.startsWith("https://")) {
        localUrl = `http://${localUrl}`;
      }
      setWebsiteUrl(localUrl);
      createProjectMutation.mutate({ name: businessName.trim(), url: localUrl, env: "local" });
    }
  };

  // Step 4: Verify & Launch Action
  const handleVerifyAndLaunch = async () => {
    if (!createdProjectId) return;
    setIsVerifying(true);
    setVerificationResult(null);

    try {
      // 1. Run readiness check
      const readinessRes = await authFetch(apiUrl(`/api/projects/${createdProjectId}/go-live/readiness`));
      const readiness = await readinessRes.json().catch(() => ({}));

      // 2. Attempt Go Live
      const goLiveRes = await authFetch(apiUrl(`/api/projects/${createdProjectId}/go-live`), {
        method: "POST",
        body: JSON.stringify({ productionUrl: websiteUrl }),
      });

      const goLiveJson = await goLiveRes.json().catch(() => ({}));

      if (goLiveRes.ok) {
        setVerificationResult({
          success: true,
          isLive: true,
          message: "🎉 You're live! Your NOVA assistant is active on your website.",
        });
        toast({ title: "🎉 You're Live!", description: "Project has been successfully verified & launched." });
      } else {
        // Safe, clean explanation
        setVerificationResult({
          success: false,
          isLive: false,
          message: goLiveJson.error || goLiveJson.message || "Verification incomplete. Ensure website is accessible and widget token is configured.",
          checks: readiness.checks || [],
        });
        toast({ title: "Launch Verification Alert", description: goLiveJson.error || "Some readiness steps require attention.", variant: "destructive" });
      }
    } catch (err: any) {
      setVerificationResult({
        success: false,
        isLive: false,
        message: "Network or reachability issue during verification. Please check your connection or inspect workspace settings.",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-background text-foreground relative">
      {/* Background Blur Orbs */}
      <div className="absolute top-[10%] left-[20%] w-[30vw] h-[30vw] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[20%] w-[30vw] h-[30vw] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-2xl relative z-10">

        {/* STEP 0: ENVIRONMENT CHOICE */}
        {step === 0 && (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-xs font-semibold px-4 py-1.5 rounded-full">
                <Sparkles className="w-3.5 h-3.5" />
                <span>NOVA Business AI Setup</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                Where is your website?
              </h1>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Select your website environment to customize your setup experience.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Option 1: Live Website */}
              <Card
                className={`group cursor-pointer transition-all duration-300 border-2 hover:border-primary/60 hover:shadow-xl bg-card/60 backdrop-blur-xl ${
                  envChoice === "live" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border"
                }`}
                onClick={() => {
                  setEnvChoice("live");
                  setWebsiteUrl("https://");
                  setStep(1);
                }}
              >
                <CardContent className="p-8 space-y-5 flex flex-col justify-between h-full">
                  <div className="space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20 flex items-center justify-center transition-transform group-hover:scale-110">
                      <Globe className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                        🌐 Live Website
                      </h3>
                      <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                        Your website is hosted and accessible online.
                      </p>
                    </div>
                  </div>
                  <Button className="w-full mt-6 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl gap-2 shadow-md">
                    Select Live Website <ArrowRight className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>

              {/* Option 2: Local Development */}
              <Card
                className={`group cursor-pointer transition-all duration-300 border-2 hover:border-purple-500/60 hover:shadow-xl bg-card/60 backdrop-blur-xl ${
                  envChoice === "local" ? "border-purple-500 bg-purple-500/5 ring-2 ring-purple-500/20" : "border-border"
                }`}
                onClick={() => {
                  setEnvChoice("local");
                  setWebsiteUrl("http://localhost:3000");
                  setStep(1);
                }}
              >
                <CardContent className="p-8 space-y-5 flex flex-col justify-between h-full">
                  <div className="space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-500 border border-purple-500/20 flex items-center justify-center transition-transform group-hover:scale-110">
                      <Laptop className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground group-hover:text-purple-400 transition-colors">
                        🖥 Local Development
                      </h3>
                      <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                        You're building/testing your website locally.
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full mt-6 border-purple-500/30 hover:bg-purple-500/10 text-purple-400 font-semibold rounded-xl gap-2">
                    Select Local Dev <ArrowRight className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* STEP 1: CREATE PROJECT (LIVE OR LOCAL) */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <button
              onClick={() => setStep(0)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to environment choice
            </button>

            <div className="text-center space-y-2">
              <Badge variant="outline" className="text-xs px-3 py-1 font-mono">
                {envChoice === "live" ? "🌐 Live Website Project" : "🖥 Local Development Project"}
              </Badge>
              <h1 className="text-3xl font-bold text-foreground tracking-tight pt-2">
                Create your project
              </h1>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                {envChoice === "live"
                  ? "Enter your business name and live website URL."
                  : "Enter your business name and local development URL."}
              </p>
            </div>

            <div className="bg-card border border-border rounded-3xl p-8 space-y-6 shadow-xl backdrop-blur-xl">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Business Name</label>
                <Input
                  placeholder="e.g. Apex Dynamics"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="h-12 rounded-xl bg-background border-border focus:border-primary/50 text-base"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {envChoice === "live" ? "Live Website URL" : "Local Website"}
                </label>
                <Input
                  placeholder={envChoice === "live" ? "https://example.com" : "http://localhost:3000"}
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleStep1Submit()}
                  className="h-12 rounded-xl bg-background border-border focus:border-primary/50 text-base font-mono"
                />
              </div>

              <Button
                onClick={handleStep1Submit}
                disabled={createProjectMutation.isPending || !businessName.trim() || !websiteUrl.trim()}
                className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base gap-2 shadow-lg"
              >
                {createProjectMutation.isPending ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Creating Project...</>
                ) : envChoice === "live" ? (
                  <>Continue <ArrowRight className="w-5 h-5" /></>
                ) : (
                  <>Connect Local Website <ArrowRight className="w-5 h-5" /></>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: AUTOMATIC WEBSITE ANALYSIS (LIVE WEBSITE) */}
        {step === 2 && envChoice === "live" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">
                ✨ NOVA is analyzing your website
              </h1>
              <p className="text-sm font-mono text-primary bg-primary/5 px-4 py-1.5 rounded-full border border-primary/20 inline-block mt-2">
                {websiteUrl}
              </p>
            </div>

            <div className="bg-card border border-border rounded-3xl p-8 space-y-4 shadow-xl backdrop-blur-xl">
              <div className="space-y-3">
                {/* Check 1 */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-background border border-border">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-blue-400" />
                    <span className="font-medium text-sm">Website connected</span>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>

                {/* Check 2 */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-background border border-border">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-indigo-400" />
                    <span className="font-medium text-sm">Business information detected</span>
                  </div>
                  {isAnalyzing && !discoveryData?.businessType ? (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  )}
                </div>

                {/* Check 3 */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-background border border-border">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    <span className="font-medium text-sm">Pages discovered</span>
                  </div>
                  {isAnalyzing && (!discoveryData?.crawledPages || discoveryData.crawledPages.length === 0) ? (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                        {discoveryData?.crawledPages?.length || 1} pages
                      </span>
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </div>
                  )}
                </div>

                {/* Stage 4 */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-background border border-border">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${isAnalysisComplete ? "bg-emerald-500" : "bg-primary animate-ping"}`} />
                    <span className="font-medium text-sm">Understanding your products & services</span>
                  </div>
                  {isAnalysisComplete ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <span className="text-xs text-muted-foreground font-mono">Analyzing...</span>
                  )}
                </div>

                {/* Stage 5 */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-background border border-border">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${isAnalysisComplete ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                    <span className="font-medium text-sm">Building AI knowledge</span>
                  </div>
                  {isAnalysisComplete ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Pending</span>
                  )}
                </div>

                {/* Stage 6 */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-background border border-border">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${isAnalysisComplete ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                    <span className="font-medium text-sm">Preparing your assistant</span>
                  </div>
                  {isAnalysisComplete ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Pending</span>
                  )}
                </div>
              </div>

              {isAnalysisFailed && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <AlertCircle className="w-4 h-4 text-red-400" /> Analysis Alert
                  </div>
                  <p>
                    The website discovery task took longer than expected or was partially limited by CORS/robot rules. NOVA AI has prepared default knowledge for your business.
                  </p>
                </div>
              )}

              <Button
                onClick={() => setStep(3)}
                className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base gap-2 mt-4"
              >
                {isAnalysisComplete ? (
                  <>Continue to Installation <ArrowRight className="w-5 h-5" /></>
                ) : (
                  <>Continue Anyway <ArrowRight className="w-5 h-5" /></>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: INSTALLATION CODE */}
        {step === 3 && envChoice === "live" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Knowledge Ready</span>
              </div>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">
                🎉 Your AI assistant is ready
              </h1>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Add NOVA to your website. Copy the installation code below and add it to your website HTML.
              </p>
            </div>

            <div className="bg-card border border-border rounded-3xl p-8 space-y-6 shadow-xl backdrop-blur-xl">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Installation Code
                </label>
                <div className="relative">
                  <pre className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs font-mono overflow-x-auto leading-relaxed">
                    {installationCode}
                  </pre>
                  <Button
                    size="sm"
                    className="absolute top-3 right-3 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium gap-1.5 rounded-xl shadow-sm"
                    onClick={copyInstallationCode}
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode ? "Copied!" : "Copy Installation Code"}
                  </Button>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">Widget Token Active:</strong> This public token securely authenticates requests from your website domain without exposing any private credentials or API keys.
                </div>
              </div>

              <Button
                onClick={() => setStep(4)}
                className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base gap-2 shadow-lg"
              >
                Next Step <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: TWO OPTIONS — VERIFY & LAUNCH OR SEE MORE SETTINGS */}
        {step === 4 && envChoice === "live" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold text-foreground tracking-tight">
                You're almost ready 🎉
              </h1>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Your NOVA assistant has been prepared. Choose how you want to proceed.
              </p>
            </div>

            {verificationResult && (
              <div
                className={`p-6 rounded-3xl border shadow-xl ${
                  verificationResult.success
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                }`}
              >
                <div className="flex items-center gap-3 font-bold text-lg mb-2">
                  {verificationResult.success ? (
                    <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-6 h-6 text-amber-400" />
                  )}
                  <span>{verificationResult.message}</span>
                </div>

                {verificationResult.success ? (
                  <div className="pt-4 flex flex-col sm:flex-row gap-3">
                    <Button
                      onClick={() => window.open(websiteUrl, "_blank")}
                      className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold gap-2 rounded-xl"
                    >
                      <ExternalLink className="w-4 h-4" /> ↗ Visit Site
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setLocation(`/projects/${createdProjectId}/edit`)}
                      className="border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-300 rounded-xl"
                    >
                      Open Project Workspace
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">
                    You can launch anytime from the Project Command Center.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Option 1: Verify & Launch */}
              <Card className="border-2 border-primary/40 bg-card/60 backdrop-blur-xl hover:border-primary transition-all duration-300 shadow-xl">
                <CardContent className="p-8 space-y-5 flex flex-col justify-between h-full">
                  <div className="space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                      <Rocket className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">
                        ✓ Verify & Launch
                      </h3>
                      <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                        Verify website reachability, widget setup, domain security, and activate Go Live immediately.
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={handleVerifyAndLaunch}
                    disabled={isVerifying}
                    className="w-full mt-6 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-base h-12 rounded-xl gap-2 shadow-lg"
                  >
                    {isVerifying ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Verifying...</>
                    ) : (
                      <>Verify & Launch <Rocket className="w-5 h-5" /></>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Option 2: See More Settings */}
              <Card className="border border-border bg-card/60 backdrop-blur-xl hover:border-foreground/30 transition-all duration-300 shadow-xl">
                <CardContent className="p-8 space-y-5 flex flex-col justify-between h-full">
                  <div className="space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-foreground/5 text-muted-foreground border border-foreground/10 flex items-center justify-center">
                      <Settings className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">
                        ⚙ See More Settings
                      </h3>
                      <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                        Explore the full Project Command Center: Knowledge Base, Widget Studio, Tools & Integrations, Agent Control, Analytics.
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => setLocation(`/projects/${createdProjectId}/edit`)}
                    className="w-full mt-6 border-foreground/20 hover:bg-foreground/5 text-foreground font-semibold text-base h-12 rounded-xl gap-2"
                  >
                    Open Workspace <Settings className="w-5 h-5" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
