import { useState } from "react";
import { 
  Sparkles, 
  ExternalLink, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Copy, 
  Check, 
  HelpCircle,
  Zap,
  Bot,
  Brain,
  Layers,
  Cpu
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ProviderGuideInfo {
  id: string;
  name: string;
  badge: string;
  description: string;
  portalUrl: string;
  portalLabel: string;
  keyPrefix: string;
  recommendedModels: string[];
  features: string[];
  setupSteps: string[];
  commonErrors: { error: string; cause: string; solution: string }[];
  troubleshootingTips: string[];
}

export const PROVIDER_GUIDES: ProviderGuideInfo[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    badge: "Official & Recommended",
    description: "Ultra-low latency, native multi-modal reasoning, large context windows, and cost-effective enterprise models.",
    portalUrl: "https://aistudio.google.com/app/apikey",
    portalLabel: "Google AI Studio",
    keyPrefix: "AIza...",
    recommendedModels: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash-002"],
    features: [
      "1M+ token context window",
      "Native Structured Output & Tool Calling",
      "Fast response streaming (<350ms TTFT)",
      "Generous free tier with Pay-as-you-go upgrade"
    ],
    setupSteps: [
      "Navigate to Google AI Studio (aistudio.google.com/app/apikey).",
      "Sign in with your Google account and click 'Create API Key'.",
      "Select an existing Google Cloud project or create a new one.",
      "Copy the generated key starting with 'AIza...'.",
      "Paste the key in NOVA API Center. The system will auto-verify and unlock available Gemini models."
    ],
    commonErrors: [
      {
        error: "429 Resource Exhausted / Quota Exceeded",
        cause: "Free tier RPM or Daily Request limits reached (15 RPM / 1,500 RPD).",
        solution: "Enable pay-as-you-go billing in Google Cloud Console or wait for quota reset at 00:00 UTC."
      },
      {
        error: "403 API Key Not Valid",
        cause: "The API key was revoked, mistyped, or disabled in Google Cloud Console.",
        solution: "Generate a new API key in Google AI Studio and replace it in NOVA."
      },
      {
        error: "Model Not Found",
        cause: "Target model is not supported on your API tier or region.",
        solution: "Select 'gemini-2.5-flash' or 'gemini-2.0-flash' in model settings."
      }
    ],
    troubleshootingTips: [
      "Ensure the 'Generative Language API' is enabled in your Google Cloud Project.",
      "If using IP restrictions on your Google Cloud key, allow outgoing Render/Vercel server IPs or remove IP restrictions for backend API keys."
    ]
  },
  {
    id: "openai",
    name: "OpenAI",
    badge: "Industry Standard",
    description: "Flagship GPT-4o, lightweight GPT-4o-mini, and advanced reasoning models (o1, o3-mini).",
    portalUrl: "https://platform.openai.com/api-keys",
    portalLabel: "OpenAI Platform",
    keyPrefix: "sk-proj-... or sk-...",
    recommendedModels: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"],
    features: [
      "Strong general reasoning & instruction following",
      "Robust function and tool calling",
      "High throughput enterprise endpoints",
      "Extensive ecosystem compatibility"
    ],
    setupSteps: [
      "Visit the OpenAI Platform (platform.openai.com/api-keys).",
      "Log in and navigate to 'Dashboard' > 'API Keys'.",
      "Click '+ Create new secret key' with 'All permissions' or Model Read/Write.",
      "Save the key securely (keys starting with 'sk-proj-' or 'sk-').",
      "Ensure your OpenAI organization has active prepaid billing credits under 'Billing'."
    ],
    commonErrors: [
      {
        error: "429 Insufficient Quota (insufficient_quota)",
        cause: "Your OpenAI account has $0 prepaid balance or expired free trial credits.",
        solution: "Add credit balance ($5+) at platform.openai.com/account/billing."
      },
      {
        error: "401 Invalid Authentication",
        cause: "Incorrect API key or key from a revoked project.",
        solution: "Generate a new secret key under the intended OpenAI Project."
      },
      {
        error: "429 Rate Limit Reached",
        cause: "Requests per minute (RPM) or tokens per minute (TPM) tier limit reached.",
        solution: "NOVA automatically applies exponential cooldown. Upgrade your usage tier on OpenAI for higher concurrency."
      }
    ],
    troubleshootingTips: [
      "OpenAI requires prepaid balance; ChatGPT Plus subscriptions do NOT include API credits.",
      "Check that your key has access to 'All Models' or specifically 'gpt-4o'."
    ]
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    badge: "High Precision Reasoning",
    description: "Industry-leading nuanced writing, complex coding, and safe multi-step problem solving with Claude 3.5 Sonnet.",
    portalUrl: "https://console.anthropic.com/settings/keys",
    portalLabel: "Anthropic Console",
    keyPrefix: "sk-ant-...",
    recommendedModels: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
    features: [
      "Superior code generation & technical synthesis",
      "200K token context window",
      "Accurate tone and persona adherence",
      "Low hallucination rates on domain documents"
    ],
    setupSteps: [
      "Go to the Anthropic Console (console.anthropic.com).",
      "Navigate to 'Settings' > 'API Keys'.",
      "Click 'Create Key' and assign a descriptive name (e.g., 'NOVA-Production').",
      "Copy the key starting with 'sk-ant-api03-...'.",
      "Ensure credit is loaded under 'Plans & Billing' in Anthropic Console."
    ],
    commonErrors: [
      {
        error: "400 Credit Balance Too Low",
        cause: "Prepaid API balance is exhausted in Anthropic Console.",
        solution: "Add $5+ prepaid credits in Anthropic Console under Plans & Billing."
      },
      {
        error: "401 Unauthorized API Key",
        cause: "Malformed or expired Anthropic key.",
        solution: "Re-generate key from Anthropic Console."
      }
    ],
    troubleshootingTips: [
      "Anthropic Claude Pro subscriptions are separate from the API developer platform.",
      "Claude 3.5 Sonnet provides the best combination of speed, reasoning, and cost."
    ]
  },
  {
    id: "groq",
    name: "Groq Cloud",
    badge: "Ultra-Fast LPU Inference",
    description: "Extreme speed (500+ tokens/sec) on open weights models (Llama 3.3 70B, Llama 3.1 8B, DeepSeek R1).",
    portalUrl: "https://console.groq.com/keys",
    portalLabel: "Groq Console",
    keyPrefix: "gsk_...",
    recommendedModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "deepseek-r1-distill-llama-70b"],
    features: [
      "Blazing fast response times (300-800 tokens/sec)",
      "High concurrency on open models",
      "Great for rapid customer triage & agent workflows",
      "Generous free developer tier"
    ],
    setupSteps: [
      "Log in to Groq Console (console.groq.com/keys).",
      "Click 'Create API Key'.",
      "Copy the key starting with 'gsk_...'.",
      "Paste into NOVA API Center to enable instant acceleration."
    ],
    commonErrors: [
      {
        error: "429 Rate Limit Exceeded (TPM / RPM)",
        cause: "Free tier limits on large models (e.g. 6k tokens/min on 70B).",
        solution: "Switch to 'llama-3.1-8b-instant' for higher throughput or upgrade to Groq On-Demand."
      }
    ],
    troubleshootingTips: [
      "Use Groq when widget latency is your #1 priority for customer conversations."
    ]
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    badge: "Multi-Model Gateway",
    description: "Unified access to 200+ models from Google, Anthropic, Meta, Mistral, and DeepSeek through a single key and prepaid wallet.",
    portalUrl: "https://openrouter.ai/keys",
    portalLabel: "OpenRouter Keys",
    keyPrefix: "sk-or-...",
    recommendedModels: ["google/gemini-2.0-flash-exp:free", "anthropic/claude-3.5-sonnet", "meta-llama/llama-3.3-70b-instruct"],
    features: [
      "Single billing wallet for all AI providers",
      "Automatic failover routing if one provider is degraded",
      "Access to free tier experimental models",
      "No minimum commitment"
    ],
    setupSteps: [
      "Sign in to OpenRouter (openrouter.ai/keys).",
      "Click 'Create Key' and set credit limits if desired.",
      "Copy the key starting with 'sk-or-v1-...'.",
      "Paste into NOVA API Center."
    ],
    commonErrors: [
      {
        error: "402 Payment Required",
        cause: "OpenRouter credit balance is depleted.",
        solution: "Top up credits with card or crypto at openrouter.ai/credits."
      }
    ],
    troubleshootingTips: [
      "OpenRouter is the ideal backup provider when direct API quotas are limited."
    ]
  }
];

export function ProviderGuides() {
  const [selectedProvider, setSelectedProvider] = useState<string>("gemini");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const currentGuide = PROVIDER_GUIDES.find(p => p.id === selectedProvider) || PROVIDER_GUIDES[0];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getProviderIcon = (id: string) => {
    switch (id) {
      case "gemini": return <Sparkles className="w-4 h-4 text-blue-400" />;
      case "openai": return <Brain className="w-4 h-4 text-emerald-400" />;
      case "claude": return <Bot className="w-4 h-4 text-amber-400" />;
      case "groq": return <Zap className="w-4 h-4 text-orange-400" />;
      case "openrouter": return <Layers className="w-4 h-4 text-purple-400" />;
      default: return <Cpu className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Provider Selector Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-secondary/50 rounded-2xl border border-border/60">
        {PROVIDER_GUIDES.map(p => {
          const isActive = p.id === selectedProvider;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedProvider(p.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
                isActive 
                  ? "bg-card text-foreground shadow-sm border border-border" 
                  : "text-muted-foreground hover:text-foreground hover:bg-card/40"
              }`}
            >
              {getProviderIcon(p.id)}
              <span>{p.name}</span>
              {isActive && <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 bg-primary/10 text-primary border-0">{p.badge}</Badge>}
            </button>
          );
        })}
      </div>

      {/* Active Guide Card */}
      <Card className="bg-card border-border shadow-xs overflow-hidden">
        <CardHeader className="border-b border-border/50 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                {getProviderIcon(currentGuide.id)}
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {currentGuide.name} Setup & Troubleshooting Guide
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  {currentGuide.description}
                </CardDescription>
              </div>
            </div>

            <a 
              href={currentGuide.portalUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-primary/90 transition-all shadow-xs shrink-0"
            >
              <span>Get Key on {currentGuide.portalLabel}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Key Format & Recommended Models */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-secondary/40 border border-border/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Expected Key Format</span>
                <Badge variant="outline" className="text-[11px] font-mono bg-background">
                  {currentGuide.keyPrefix}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Keys start with this prefix and are automatically encrypted with AES-256-GCM before storage.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-secondary/40 border border-border/60 space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Recommended Models</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {currentGuide.recommendedModels.map(m => (
                  <Badge key={m} variant="secondary" className="text-[10px] font-mono bg-background/80 border border-border/40">
                    {m}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Setup Steps */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Step-by-Step Configuration
            </h4>
            <div className="space-y-2">
              {currentGuide.setupSteps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30 border border-border/40 text-xs">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="text-foreground/90 leading-relaxed">{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Common Errors & Solutions Matrix */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Common Provider Errors & Fixes
            </h4>
            <div className="grid grid-cols-1 gap-3">
              {currentGuide.commonErrors.map((err, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-background border border-border/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-400 font-mono flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> {err.error}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Why it happens:</strong> {err.cause}
                  </p>
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400">
                    <strong>Solution:</strong> {err.solution}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pro Troubleshooting Tips */}
          {currentGuide.troubleshootingTips.length > 0 && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
              <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" /> Pro Tips & Security Notes
              </span>
              <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
                {currentGuide.troubleshootingTips.map((tip, idx) => (
                  <li key={idx} className="leading-relaxed">{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
