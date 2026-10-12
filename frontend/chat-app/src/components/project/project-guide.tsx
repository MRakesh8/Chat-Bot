import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { apiUrl } from "@/lib/api-url";
import { 
  Compass, CheckCircle2, AlertCircle, ArrowRight, Sparkles, Brain, Database, 
  Settings, Paintbrush, Rocket, Key, Globe, ShieldCheck, HelpCircle, Send, 
  Loader2, Layers, Lock, Server, Check, ExternalLink, ChevronRight, ShieldAlert,
  Search, Cpu, Play, Terminal, UserCheck, Activity, RefreshCw
} from "lucide-react";

interface ProjectGuideProps {
  projectId: string;
  onSelectTab: (tab: string) => void;
}

interface StageDetail {
  id: string;
  stageNumber: number;
  title: string;
  iconName: string;
  category: "setup" | "intelligence" | "engine" | "security" | "deployment";
  tabTarget?: string;
  shortDesc: string;
  whatItDoes: string;
  whyItMatters: string;
  connectsTo: string;
  whatHappensNext: string;
}

const GUIDE_STAGES: StageDetail[] = [
  {
    id: "create-project",
    stageNumber: 1,
    title: "Create Project",
    iconName: "🏗️",
    category: "setup",
    tabTarget: "overview",
    shortDesc: "Initial project identity, business configuration, and subscription plan setup.",
    whatItDoes: "Establishes a dedicated project workspace with unique project ID, share token, system prompt instructions, and subscription plan entitlement.",
    whyItMatters: "Provides the isolated multi-tenant boundary for all project data, knowledge, API keys, and chatbot settings.",
    connectsTo: "Connect Website, Project Settings, and API Keys.",
    whatHappensNext: "Connect your business website to start automated content discovery and structural analysis."
  },
  {
    id: "connect-website",
    stageNumber: 2,
    title: "Connect Website",
    iconName: "🌐",
    category: "setup",
    tabTarget: "deployment",
    shortDesc: "Connect your business website URL for local development or live production.",
    whatItDoes: "Registers target website domain. Supports both Local Development (e.g. http://localhost:3000, http://localhost:5173) and Live Production (e.g. https://example.com).",
    whyItMatters: "Allows NOVA to analyze webpage structure and enforce strict domain CORS origin checks on the chatbot embed.",
    connectsTo: "Website Status and Website Analysis engine.",
    whatHappensNext: "NOVA checks connection health and runs structural analysis on the connected website."
  },
  {
    id: "website-status",
    stageNumber: 3,
    title: "Website Status",
    iconName: "🚦",
    category: "setup",
    tabTarget: "deployment",
    shortDesc: "Real-time connection verification indicator (Live / Local Dev / Connection Problem).",
    whatItDoes: "Monitors active connection state: 🟢 Live Production (active domain), 🟡 Local Development (localhost session), or 🔴 Connection Issue.",
    whyItMatters: "Ensures developer and business owner know whether the project is ready for local testing or production deployment.",
    connectsTo: "Website Analysis and Readiness Check.",
    whatHappensNext: "Extracted structure feeds into Intelligent Business Information."
  },
  {
    id: "website-analysis",
    stageNumber: 4,
    title: "Website Analysis",
    iconName: "🔍",
    category: "intelligence",
    tabTarget: "overview",
    shortDesc: "Extracts website metadata, page structure, headings, forms, and service content.",
    whatItDoes: "Parses connected webpage structure, metadata tags, navigation links, and visible page elements to understand the website's purpose.",
    whyItMatters: "Automates initial project setup by discovering core business offerings without requiring manual copy-pasting.",
    connectsTo: "Intelligent Business Information and Knowledge Base.",
    whatHappensNext: "Discovered facts are converted into structured business intelligence."
  },
  {
    id: "intelligent-info",
    stageNumber: 5,
    title: "Intelligent Business Info",
    iconName: "🧠",
    category: "intelligence",
    tabTarget: "overview",
    shortDesc: "Converts discovered website data into structured business intelligence.",
    whatItDoes: "Synthesizes raw website content into structured facts (Business type, Core Services, Target Products, Contact Info, Discovered Capabilities).",
    whyItMatters: "Differs from raw documents: Intelligent Business Info provides high-level structured context, while Knowledge Base provides document RAG chunks.",
    connectsTo: "System Instructions, Knowledge Base, and AI Engine prompt context.",
    whatHappensNext: "Upload detailed documents or website URLs into the Knowledge Base for deep retrieval."
  },
  {
    id: "knowledge-base",
    stageNumber: 6,
    title: "Knowledge Base (RAG)",
    iconName: "📚",
    category: "intelligence",
    tabTarget: "knowledge",
    shortDesc: "Indexes business documents and scraped website chunks for vector search retrieval.",
    whatItDoes: "Stores uploaded PDFs, text files, and scraped web pages. Generates vector embeddings for Retrieval-Augmented Generation (RAG).",
    whyItMatters: "Ensures the chatbot answers customer queries with factual, grounded information from official company documents.",
    connectsTo: "RAG Retrieval Service and AI Engine prompt context.",
    whatHappensNext: "Configure chatbot conversation persona and system instructions."
  },
  {
    id: "chat-experience",
    stageNumber: 7,
    title: "Chat Experience",
    iconName: "💬",
    category: "engine",
    tabTarget: "settings",
    shortDesc: "Configures conversation behavior, AI persona rules, and system prompt instructions.",
    whatItDoes: "Controls HOW the AI conversation behaves (tone of voice, prompt firewall safety guidelines, fallback responses).",
    whyItMatters: "Distinguishes conversation rules (Chat Experience) from visual appearance (Widget Studio).",
    connectsTo: "AI Router and System Instruction builder.",
    whatHappensNext: "AI Engine combines instructions with Search, RAG, and DOM page context."
  },
  {
    id: "ai-engine",
    stageNumber: 8,
    title: "AI Engine & Router",
    iconName: "🤖",
    category: "engine",
    tabTarget: "api-keys",
    shortDesc: "Multi-provider AI router executing requests with failover and rate limit protection.",
    whatItDoes: "Routes queries across primary AI providers (Gemini) with automatic key rotation, failover, and quota error handling.",
    whyItMatters: "Guarantees 99.9% uptime by automatically switching provider keys if quota or rate limits are reached.",
    connectsTo: "Search, RAG Knowledge Base, Context Engine DOM, and Agent Control.",
    whatHappensNext: "Fetches grounded context from Search, RAG, and DOM before generating final answers."
  },
  {
    id: "context-sources",
    stageNumber: 9,
    title: "Search + RAG + DOM",
    iconName: "🔎",
    category: "engine",
    tabTarget: "context-engine",
    shortDesc: "Combines Search, Knowledge Base RAG, and Webpage DOM Context into grounded prompt context.",
    whatItDoes: "Fuses three distinct context sources: 🔎 SEARCH (web/project search), 🧠 RAG (document chunks), and 🌐 DOM (sanitized active webpage context from Website Context Engine).",
    whyItMatters: "Allows the chatbot to know what page the customer is viewing on your website in real-time while grounding answers in document facts.",
    connectsTo: "AI Engine prompt context and Agent Control pipeline.",
    whatHappensNext: "Customize visual appearance in Widget Studio."
  },
  {
    id: "widget-studio",
    stageNumber: 10,
    title: "Widget Studio",
    iconName: "🎨",
    category: "engine",
    tabTarget: "widget-studio",
    shortDesc: "Customizes visual appearance (colors, header, pill input, launcher, custom CSS).",
    whatItDoes: "Provides no-code customization for chatbot widget (16 custom colors, preset themes, header, AI/user bubbles, pill input, status indicator, responsive preview).",
    whyItMatters: "Single source of truth: preview in Widget Studio matches the exact CSS rendered on real customer sites.",
    connectsTo: "Customer Website Embed (`widget.js`).",
    whatHappensNext: "Connect external business tools and integrations."
  },
  {
    id: "tools-integrations",
    stageNumber: 11,
    title: "Tools & Integrations",
    iconName: "🔌",
    category: "security",
    tabTarget: "integrations",
    shortDesc: "Connects authorized external business platforms (e.g. Shopify sandbox/production).",
    whatItDoes: "Stores encrypted integration credentials for external business platforms. Exposes registered tools (`executeServerTool`).",
    whyItMatters: "Enables automated business actions (checking order status, updating records) under strict security controls.",
    connectsTo: "Agent Control security pipeline.",
    whatHappensNext: "All tool execution requests pass through the 9-Step Agent Control pipeline."
  },
  {
    id: "agent-control",
    stageNumber: 12,
    title: "Agent Control",
    iconName: "🎯",
    category: "security",
    tabTarget: "overview",
    shortDesc: "9-step security gate enforcing RBAC, entitlement, risk assessment, confirmation, and verification.",
    whatItDoes: "Evaluates action requests through 9 stages: Understand → Plan → Permissions → Entitlement → Risk Assessment → Confirmation Token → Execute Server Tool → Verification → User Report.",
    whyItMatters: "Guarantees zero unverified actions. Never claims an action succeeded unless independent `VerificationAgent` confirms state change.",
    connectsTo: "CoordinatorAgent, PlannerAgent, SecurityAgent, VerificationAgent, and Audit Log.",
    whatHappensNext: "Test your chatbot in Local Development before going live."
  },
  {
    id: "local-testing",
    stageNumber: 13,
    title: "Local Testing",
    iconName: "🧪",
    category: "deployment",
    tabTarget: "deployment",
    shortDesc: "Test the embeddable chatbot widget on localhost development websites.",
    whatItDoes: "Supports testing widget on http://localhost:3000 or http://localhost:5173 using localhost origin bypass session.",
    whyItMatters: "Allows full end-to-end testing on a developer laptop without requiring public cloud hosting or domain DNS.",
    connectsTo: "Readiness Check and Go Live.",
    whatHappensNext: "Run automated Readiness Check to verify production deployment readiness."
  },
  {
    id: "readiness-go-live",
    stageNumber: 14,
    title: "Readiness Check & Go Live",
    iconName: "🚀",
    category: "deployment",
    tabTarget: "deployment",
    shortDesc: "Automated production readiness audit and one-click production activation.",
    whatItDoes: "Verifies 8 readiness criteria (Local testing, Production URL, Widget config, AI router, Knowledge/RAG, Entitlement, Domain CORS, Overall readiness). One-click Go Live activates production.",
    whyItMatters: "Preserves identical Project ID, Knowledge Base, and Widget Identity when switching from local dev to production.",
    connectsTo: "Live Production Website.",
    whatHappensNext: "Real customers interact with your chatbot on your live production website."
  }
];

export function ProjectGuide({ projectId, onSelectTab }: ProjectGuideProps) {
  const authFetch = useAuthFetch();
  
  // Selected Stage Detail Modal State
  const [selectedStage, setSelectedStage] = useState<StageDetail | null>(null);

  // Ask NOVA Modal State
  const [isAskNovaOpen, setIsAskNovaOpen] = useState(false);
  const [askStageTitle, setAskStageTitle] = useState<string>("Complete Project Architecture");
  const [askQuestion, setAskQuestion] = useState("");
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  // Fetch real project readiness check status
  const { data: projectData } = useQuery({
    queryKey: ["project-guide-data", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}`));
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!projectId && projectId !== "new"
  });

  const { data: widgetData } = useQuery({
    queryKey: ["project-guide-widget", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/widget/settings`));
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!projectId && projectId !== "new"
  });

  const handleOpenAskNova = (stageTitle?: string) => {
    setAskStageTitle(stageTitle || "Complete Project Architecture");
    setAskQuestion("");
    setAskAnswer(null);
    setIsAskNovaOpen(true);
  };

  const handleAskNovaSubmit = async (questionText: string) => {
    if (!questionText.trim()) return;
    setIsAsking(true);
    setAskAnswer(null);

    try {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/guide/ask`), {
        method: "POST",
        body: JSON.stringify({
          question: questionText,
          stage: askStageTitle
        })
      });

      if (!res.ok) {
        throw new Error("Failed to get answer");
      }

      const data = await res.json();
      setAskAnswer(data.answer || "NOVA Business AI uses Knowledge Base RAG retrieval, Context Engine DOM context, and 9-step Agent Control tool execution to provide grounded responses.");
    } catch (err) {
      setAskAnswer("NOVA Business AI connects website analysis, Knowledge Base documents, and Context Engine DOM data to deliver grounded responses. Business write actions are processed through the 9-Step Agent Control pipeline.");
    } finally {
      setIsAsking(false);
    }
  };

  const isWidgetEnabled = widgetData?.isEnabled ?? true;

  return (
    <div className="space-y-8 mt-6">
      
      {/* Header Banner */}
      <Card className="bg-card border-border overflow-hidden relative shadow-sm">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Compass className="w-64 h-64 text-primary" />
        </div>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-primary/10 text-primary border-primary/20 text-xs px-2.5 py-0.5">
                  Visual Architecture & Product Flow
                </Badge>
                <Badge variant="outline" className="text-[11px] text-muted-foreground border-border">
                  Live Implementation
                </Badge>
              </div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Compass className="w-5 h-5 text-primary" />
                Project Working — How NOVA Works
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                Understand how your NOVA Business AI project connects website discovery, Knowledge Base RAG, AI Engine, Widget Studio, and 9-Step Agent Control.
              </CardDescription>
            </div>

            <Button
              type="button"
              className="gap-2 text-xs h-9 bg-primary text-primary-foreground hover:bg-primary/90 shadow"
              onClick={() => handleOpenAskNova("General Overview")}
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              ✨ Ask NOVA About This Project
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Main Diagram 1: Setup & Configuration Product Flow */}
      <Card className="bg-card border-border shadow-sm">
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                1. Complete Project Setup & Configuration Flow
              </CardTitle>
              <CardDescription className="text-xs">
                Click any stage box to view detailed architecture, connections, and actions.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 text-emerald-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Active
              </span>
              <span className="text-muted-foreground">• 14 Stages</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          
          {/* Grid Layout for Setup Flow Stages */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {GUIDE_STAGES.map((stage) => {
              return (
                <div
                  key={stage.id}
                  onClick={() => setSelectedStage(stage)}
                  className="p-4 bg-muted/30 border border-border/80 hover:border-primary/50 hover:bg-muted/60 rounded-xl transition-all duration-200 cursor-pointer group flex flex-col justify-between relative shadow-2xs"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                        Stage {stage.stageNumber}
                      </span>
                      <span className="text-lg">{stage.iconName}</span>
                    </div>

                    <h4 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                      {stage.title}
                      <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto text-primary" />
                    </h4>

                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                      {stage.shortDesc}
                    </p>
                  </div>

                  <div className="pt-3 mt-3 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="capitalize">{stage.category}</span>
                    <span className="text-primary font-medium group-hover:underline">Details & Actions →</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stage 12 Special Visual Section: AGENT CONTROL PIPELINE */}
      <Card className="bg-card border-primary/30 border-2 shadow-md">
        <CardHeader className="pb-3 bg-primary/5 border-b border-primary/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge className="bg-primary text-primary-foreground text-xs">Major Security Gate</Badge>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  🎯 AGENT CONTROL — 9-Step Execution Pipeline
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                Every customer or user business action is verified through 9 security gates before running third-party tools.
              </CardDescription>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 h-8 border-primary/30 hover:bg-primary/10 text-primary"
              onClick={() => handleOpenAskNova("Agent Control Pipeline")}
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              Ask NOVA About Agent Control
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-9 gap-2">
            {[
              { step: 1, title: "UNDERSTAND", desc: "Identifies user intent & goal", icon: "🧠" },
              { step: 2, title: "PLAN", desc: "Determines required tool steps", icon: "📋" },
              { step: 3, title: "PERMISSIONS", desc: "Verifies user/project RBAC", icon: "🔐" },
              { step: 4, title: "ENTITLEMENT", desc: "Checks subscription plan limits", icon: "💳" },
              { step: 5, title: "RISK", desc: "Classifies Read-Only vs High-Risk", icon: "⚠️" },
              { step: 6, title: "CONFIRMATION", desc: "Requests token authorization if required", icon: "🔑" },
              { step: 7, title: "EXECUTE", desc: "Runs authorized executeServerTool", icon: "⚙️" },
              { step: 8, title: "VERIFY", desc: "Independent VerificationAgent state audit", icon: "✅" },
              { step: 9, title: "REPORT", desc: "Returns verified result to user", icon: "💬" },
            ].map((gate) => (
              <div key={gate.step} className="p-2.5 bg-muted/40 border border-border rounded-lg text-center flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-primary block font-mono">Step {gate.step}</span>
                  <span className="text-base my-1 block">{gate.icon}</span>
                  <h5 className="text-[11px] font-bold text-foreground truncate">{gate.title}</h5>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1 leading-tight">{gate.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-muted/20 border border-border rounded-lg flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
              <span><strong>Zero Unverified Actions Guarantee:</strong> NOVA never claims an action succeeded unless independent <code className="text-xs font-mono text-primary bg-primary/10 px-1 rounded">VerificationAgent</code> confirms the exact state change on the target platform.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Diagram 2: Live Customer Conversation Flow */}
      <Card className="bg-card border-border shadow-sm">
        <CardHeader className="pb-3 border-b border-border">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              2. Live Customer Conversation Flow (Execution Architecture)
            </CardTitle>
            <CardDescription className="text-xs">
              What happens step-by-step when a real customer asks a question on your production website.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-xl space-y-6 font-mono text-xs text-zinc-300">
            
            {/* Step 1: Customer Question */}
            <div className="flex items-center gap-4 bg-zinc-900 p-3 rounded-lg border border-zinc-800">
              <span className="text-lg">👤</span>
              <div>
                <span className="text-xs font-bold text-emerald-400 block font-sans">1. CUSTOMER QUESTION</span>
                <span className="text-zinc-300 font-mono text-xs">"I want to know about your services or check my order status."</span>
              </div>
            </div>

            <div className="text-center text-zinc-600 font-bold">↓</div>

            {/* Step 2: Context Fusion */}
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-3">
              <div className="flex items-center justify-between font-sans font-bold text-xs text-primary">
                <span>2. AI ENGINE + CONTEXT FUSION</span>
                <span className="text-[10px] text-zinc-500 font-mono">Grounded Prompt Context</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-sans text-xs">
                <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded">
                  <div className="font-bold text-sky-400 flex items-center gap-1.5 mb-1">
                    <Search className="w-3.5 h-3.5" /> 🔎 SEARCH
                  </div>
                  <p className="text-[11px] text-zinc-400">Finds relevant information from web and project search sources.</p>
                </div>

                <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded">
                  <div className="font-bold text-purple-400 flex items-center gap-1.5 mb-1">
                    <Database className="w-3.5 h-3.5" /> 🧠 RAG
                  </div>
                  <p className="text-[11px] text-zinc-400">Retrieves indexed document chunks from Knowledge Base vector store.</p>
                </div>

                <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded">
                  <div className="font-bold text-amber-400 flex items-center gap-1.5 mb-1">
                    <Globe className="w-3.5 h-3.5" /> 🌐 DOM CONTEXT
                  </div>
                  <p className="text-[11px] text-zinc-400">Uses sanitized webpage elements from Website Context Engine.</p>
                </div>
              </div>
            </div>

            <div className="text-center text-zinc-600 font-bold">↓</div>

            {/* Step 3: Agent Control & Decision */}
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-3">
              <div className="font-sans font-bold text-xs text-yellow-400 flex items-center justify-between">
                <span>3. AGENT CONTROL PIPELINE</span>
                <span className="text-[10px] text-zinc-500 font-mono">RBAC • Entitlement • Risk • Verification</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans text-xs pt-1">
                <div className="p-3 bg-zinc-950 border border-emerald-500/30 rounded-lg">
                  <span className="text-emerald-400 font-bold block mb-1">Option A: Information Query</span>
                  <p className="text-[11px] text-zinc-400">Generates factual grounded response from Search + RAG + DOM context directly to customer.</p>
                </div>

                <div className="p-3 bg-zinc-950 border border-blue-500/30 rounded-lg">
                  <span className="text-blue-400 font-bold block mb-1">Option B: Business Action</span>
                  <p className="text-[11px] text-zinc-400">Requests Confirmation Token if high risk → Executes authorized server tool → Verifies state change → Reports result.</p>
                </div>
              </div>
            </div>

            <div className="text-center text-zinc-600 font-bold">↓</div>

            {/* Step 4: Grounded Final Answer */}
            <div className="flex items-center gap-4 bg-emerald-950/40 p-3 rounded-lg border border-emerald-500/40">
              <span className="text-lg">✅</span>
              <div>
                <span className="text-xs font-bold text-emerald-400 block font-sans">4. FINAL GROUNDED ANSWER TO CUSTOMER</span>
                <span className="text-zinc-300 font-mono text-xs">Streaming response rendered inside embedded chatbot widget on your website.</span>
              </div>
            </div>
          </div>

          {/* Customer Safety Boundary Notice */}
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                Strict Customer Safety & Boundary Enforcement
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The customer-facing widget on your website is strictly presentation-layer. It <strong>NEVER</strong> exposes API keys, database credentials, admin controls, stack traces, provider errors, or prompt firewall rules to website visitors. Only project owners can manage settings inside this dashboard.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interactive Stage Detail Dialog */}
      <Dialog open={!!selectedStage} onOpenChange={(open) => !open && setSelectedStage(null)}>
        {selectedStage && (
          <DialogContent className="max-w-xl bg-card border-border text-foreground">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="text-xl">{selectedStage.iconName}</span>
                <div>
                  <DialogTitle className="text-base font-bold flex items-center gap-2">
                    Stage {selectedStage.stageNumber}: {selectedStage.title}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {selectedStage.shortDesc}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs">
              <div className="p-3 bg-muted/40 border border-border rounded-lg space-y-1">
                <span className="font-bold text-primary uppercase text-[10px] tracking-wider block">What It Does</span>
                <p className="text-muted-foreground leading-relaxed">{selectedStage.whatItDoes}</p>
              </div>

              <div className="p-3 bg-muted/40 border border-border rounded-lg space-y-1">
                <span className="font-bold text-emerald-500 uppercase text-[10px] tracking-wider block">Why It Matters</span>
                <p className="text-muted-foreground leading-relaxed">{selectedStage.whyItMatters}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-muted/40 border border-border rounded-lg space-y-1">
                  <span className="font-bold text-blue-400 uppercase text-[10px] tracking-wider block">What It Connects To</span>
                  <p className="text-muted-foreground leading-relaxed">{selectedStage.connectsTo}</p>
                </div>

                <div className="p-3 bg-muted/40 border border-border rounded-lg space-y-1">
                  <span className="font-bold text-amber-500 uppercase text-[10px] tracking-wider block">What Happens Next</span>
                  <p className="text-muted-foreground leading-relaxed">{selectedStage.whatHappensNext}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                {selectedStage.tabTarget ? (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => {
                      const target = selectedStage.tabTarget!;
                      setSelectedStage(null);
                      onSelectTab(target);
                    }}
                  >
                    Open {selectedStage.title} Tab
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                ) : <div />}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5 border-border"
                  onClick={() => {
                    const title = selectedStage.title;
                    setSelectedStage(null);
                    handleOpenAskNova(title);
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                  ✨ Ask NOVA About {selectedStage.title}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Ask NOVA Assistant Dialog */}
      <Dialog open={isAskNovaOpen} onOpenChange={setIsAskNovaOpen}>
        <DialogContent className="max-w-xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              ✨ Ask NOVA — {askStageTitle}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Ask any question about how NOVA Business AI works for this project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            
            {/* Suggested Prompts */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Suggested Questions</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "What is Intelligent Business Info?",
                  "What is the difference between RAG and DOM context?",
                  "What does Agent Control do?",
                  "What happens during Readiness Check?",
                  "How does a customer question reach the AI?"
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="text-[11px] bg-muted hover:bg-muted/80 text-foreground px-2.5 py-1 rounded-md border border-border text-left transition-colors"
                    onClick={() => {
                      setAskQuestion(q);
                      handleAskNovaSubmit(q);
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Q&A Form */}
            <form onSubmit={(e) => { e.preventDefault(); handleAskNovaSubmit(askQuestion); }} className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={askQuestion}
                  onChange={(e) => setAskQuestion(e.target.value)}
                  placeholder="Ask a question about this project architecture..."
                  className="bg-muted border-border text-xs"
                />
                <Button type="submit" disabled={isAsking || !askQuestion.trim()} size="sm" className="gap-1.5 text-xs shrink-0">
                  {isAsking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Ask
                </Button>
              </div>
            </form>

            {/* Answer Display */}
            {askAnswer && (
              <div className="p-4 bg-muted/40 border border-primary/20 rounded-xl space-y-2 animate-in fade-in duration-200">
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-yellow-400" />
                  NOVA Explanation
                </span>
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">
                  {askAnswer}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
