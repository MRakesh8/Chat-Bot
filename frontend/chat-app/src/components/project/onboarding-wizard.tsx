import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  Database,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Globe,
  Upload,
  Loader2,
  Bot,
  Wand2,
  ExternalLink,
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const STEPS = [
  { id: 1, label: "Profile", icon: Bot },
  { id: 2, label: "Knowledge", icon: Database },
  { id: 3, label: "Preview", icon: MessageSquare },
];

function useAuthFetch() {
  const { session } = useAuth();
  return async (url: string, options: RequestInit = {}) => {
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
}

interface OnboardingWizardProps {
  onProjectCreated?: (projectId: string, shareToken: string) => void;
}

export function OnboardingWizard({ onProjectCreated }: OnboardingWizardProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authFetch = useAuthFetch();

  const [step, setStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  // Step 1 state
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful AI assistant for {business_name}. Answer questions about our products, services, and policies clearly and accurately. If you don't know something, say so and offer to connect them with a human agent."
  );

  // Step 2 state
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawledSources, setCrawledSources] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Step 3 – live preview
  const shareUrl = shareToken
    ? `${window.location.origin}${basePath}/p/${shareToken}`
    : null;

  const createProject = async () => {
    if (!projectName.trim()) {
      toast({ title: "Project name is required", variant: "destructive" });
      return;
    }
    if (!systemPrompt.trim()) {
      toast({ title: "AI persona / instructions are required", variant: "destructive" });
      return;
    }
    setIsCreating(true);
    try {
      const res = await authFetch(apiUrl("/api/projects"), {
        method: "POST",
        body: JSON.stringify({
          name: projectName.trim(),
          description: projectDescription.trim(),
          systemPrompt: systemPrompt.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to create project");
      }
      const data = await res.json();
      setCreatedProjectId(data.id);
      setShareToken(data.shareToken);
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
      onProjectCreated?.(data.id, data.shareToken);
      toast({ title: "Project created! ✅", description: "Now let's add some knowledge." });
      setStep(2);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const crawlWebsite = async () => {
    if (!websiteUrl.trim() || !createdProjectId) return;
    setIsCrawling(true);
    try {
      const res = await authFetch(apiUrl(`/api/projects/${createdProjectId}/files/url`), {
        method: "POST",
        body: JSON.stringify({
          url: websiteUrl.trim(),
          sourceType: "website",
          categoryName: "Onboarding",
        }),
      });
      if (!res.ok) throw new Error("Failed to crawl website");
      setCrawledSources((prev) => [...prev, websiteUrl.trim()]);
      setWebsiteUrl("");
      toast({ title: "Website crawled ✅", description: "Added to knowledge base." });
    } catch (err: any) {
      toast({ title: "Crawl failed", description: err.message, variant: "destructive" });
    } finally {
      setIsCrawling(false);
    }
  };

  const { session } = useAuth();

  const uploadFile = async (file: File) => {
    if (!createdProjectId) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", createdProjectId);
      formData.append("categoryName", "Onboarding");

      const token = session?.access_token;

      const res = await fetch(apiUrl(`/api/projects/${createdProjectId}/files/upload`), {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      setUploadedFiles((prev) => [...prev, file.name]);
      toast({ title: `${file.name} uploaded ✅` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(uploadFile);
    e.target.value = "";
  };

  const goToEditor = () => {
    if (createdProjectId) {
      setLocation(`/admin/projects/${createdProjectId}/edit`);
    }
  };

  const progressValue = (step / STEPS.length) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-sm font-medium px-4 py-2 rounded-full mb-4">
            <Wand2 className="w-4 h-4" />
            Project Setup Wizard
          </div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-tight mb-3">
            {step === 1 && "Create your AI Assistant"}
            {step === 2 && "Add Knowledge Base"}
            {step === 3 && "Preview your Chatbot"}
          </h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            {step === 1 && "Give your bot a name, persona, and instructions to get started."}
            {step === 2 && "Upload documents or crawl a website to train your AI."}
            {step === 3 && "Your chatbot is live! Test it and then open the full editor."}
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isDone = step > s.id;
            const isActive = step === s.id;
            return (
              <div key={s.id} className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    isDone
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : isActive
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-foreground/5 text-muted-foreground border border-foreground/10"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                  {s.label}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-px ${step > s.id ? "bg-emerald-500/50" : "bg-foreground/10"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <Progress value={progressValue} className="h-1 mb-8 bg-foreground/10" />

        {/* --- STEP 1: Profile --- */}
        {step === 1 && (
          <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Project Name *</label>
              <Input
                placeholder="e.g. Acme Support Bot"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="h-12 rounded-xl bg-foreground/[0.02] border-foreground/10 focus:border-primary/50"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Description (optional)</label>
              <Input
                placeholder="What does this chatbot do?"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                className="h-12 rounded-xl bg-foreground/[0.02] border-foreground/10 focus:border-primary/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">AI Persona & Instructions *</label>
              <p className="text-xs text-muted-foreground">
                Tell the AI who it is and how to behave. Use <code className="bg-foreground/10 px-1 py-0.5 rounded text-xs">{"{business_name}"}</code> as a placeholder.
              </p>
              <Textarea
                placeholder="You are a helpful AI assistant for..."
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={6}
                className="rounded-xl bg-foreground/[0.02] border-foreground/10 focus:border-primary/50 font-mono text-sm resize-none"
              />
            </div>

            <Button
              onClick={createProject}
              disabled={isCreating || !projectName.trim() || !systemPrompt.trim()}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground gap-2 font-medium"
            >
              {isCreating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating project...</>
              ) : (
                <>Create Project <ArrowRight className="w-4 h-4" /></>
              )}
            </Button>
          </div>
        )}

        {/* --- STEP 2: Knowledge --- */}
        {step === 2 && (
          <div className="bg-card border border-border rounded-2xl p-8 space-y-8">

            {/* Website crawl */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">Crawl a Website</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your website URL and we'll extract the text content automatically.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="https://yourwebsite.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && crawlWebsite()}
                  className="flex-1 h-11 rounded-xl bg-foreground/[0.02] border-foreground/10 focus:border-primary/50"
                />
                <Button
                  onClick={crawlWebsite}
                  disabled={isCrawling || !websiteUrl.trim()}
                  className="h-11 px-5 rounded-xl gap-2 shrink-0"
                >
                  {isCrawling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                  Crawl
                </Button>
              </div>
              {crawledSources.length > 0 && (
                <div className="space-y-1">
                  {crawledSources.map((url) => (
                    <div key={url} className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      {url}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-foreground/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-3 text-muted-foreground">or</span>
              </div>
            </div>

            {/* File upload */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">Upload Documents</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Supported: PDF, DOCX, TXT, CSV, PPTX, XLSX and more.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.md,.csv,.pptx,.ppt,.xlsx,.xls,.json,.xml"
                onChange={handleFileSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full border-2 border-dashed border-foreground/20 hover:border-primary/40 rounded-xl p-8 text-center cursor-pointer transition-colors duration-200 group"
              >
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Uploading...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
                    <p className="text-sm text-foreground font-medium group-hover:text-primary transition-colors">
                      Click to upload files
                    </p>
                    <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, CSV, etc.</p>
                  </div>
                )}
              </button>
              {uploadedFiles.length > 0 && (
                <div className="space-y-1">
                  {uploadedFiles.map((fname) => (
                    <div key={fname} className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      {fname}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="flex-1 h-11 rounded-xl border-foreground/10 gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                className="flex-1 h-11 rounded-xl bg-gradient-to-r from-primary to-primary/80 gap-2"
              >
                {crawledSources.length > 0 || uploadedFiles.length > 0 ? (
                  <>Preview Chatbot <ArrowRight className="w-4 h-4" /></>
                ) : (
                  <>Skip & Preview <ArrowRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* --- STEP 3: Preview --- */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-medium text-foreground">Live Preview — {projectName}</span>
                </div>
                {shareUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(shareUrl, "_blank")}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="w-3 h-3" /> Open
                  </Button>
                )}
              </div>
              {shareUrl ? (
                <iframe
                  src={shareUrl}
                  className="w-full h-[500px] border-0"
                  title="Chatbot Preview"
                />
              ) : (
                <div className="flex items-center justify-center h-[500px] text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading preview...
                </div>
              )}
            </div>

            {/* CTA */}
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-6 flex flex-col sm:flex-row gap-4 items-center">
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">Your chatbot is ready! 🎉</h3>
                <p className="text-sm text-muted-foreground">
                  Add more knowledge, customize the widget, configure channels, and deploy.
                </p>
              </div>
              <div className="flex gap-3 shrink-0">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="gap-2 border-foreground/10"
                >
                  <ArrowLeft className="w-4 h-4" /> Add Knowledge
                </Button>
                <Button
                  onClick={goToEditor}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/80"
                >
                  <Sparkles className="w-4 h-4" /> Open Full Editor
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
