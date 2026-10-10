import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, ArrowRight, CheckCircle2, Shield, Lock, Globe, Database, 
  Cpu, MessageSquare, ExternalLink, ChevronDown, Menu, X, Loader2, 
  Layers, Building2, Users, Check, Laptop, Rocket, Send, HelpCircle,
  Clock, ShieldCheck, Zap, Key
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/use-seo";
import { NovaBrand } from "@/components/ui/nova-brand";

interface DemoScenario {
  id: string;
  badge: string;
  title: string;
  userMessage: string;
  aiResponse: string;
  sourceAttribution: string;
  actionPill: string;
  actionStatus: "pending_approval" | "ready" | "verified";
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "delivery",
    badge: "Retail & Orders",
    title: "Same-Day Delivery & Tracking",
    userMessage: "Do you offer same-day delivery to Coimbatore?",
    aiResponse: "Yes. Orders placed before 2:00 PM ship same day in Coimbatore. Standard delivery takes 1–2 days. Would you like me to look up tracking for an existing order?",
    sourceAttribution: "shipping-policy.html · Discovered via Website Intelligence",
    actionPill: "Order Tracking Workflow · Ready, awaiting visitor approval",
    actionStatus: "pending_approval",
  },
  {
    id: "security",
    badge: "SaaS & Security",
    title: "Data Isolation & Privacy",
    userMessage: "Does NOVA store our customer payment data or API keys?",
    aiResponse: "No. Payment credentials are handled exclusively by verified payment providers, and API keys are stored with AES-256-GCM encryption in tenant-isolated database records.",
    sourceAttribution: "Security Architecture & Tenant Isolation Guidelines",
    actionPill: "Tenant Boundary Guard · Verified isolated organization scope",
    actionStatus: "verified",
  },
  {
    id: "booking",
    badge: "Services & Appointments",
    title: "Rescheduling & Calendar",
    userMessage: "Can I reschedule my consultation for tomorrow at 4 PM?",
    aiResponse: "I found your reservation for Apex Dynamics Strategy Session. Tomorrow at 4:00 PM IST is available. Would you like me to update your booking?",
    sourceAttribution: "Connected Booking Service & Consultation Rules",
    actionPill: "Calendar Reschedule Action · Awaiting visitor confirmation",
    actionStatus: "pending_approval",
  },
  {
    id: "lead",
    badge: "Inbound & Sales",
    title: "Lead Qualification & Inquiry",
    userMessage: "We need custom AI setup for our 50-person support team.",
    aiResponse: "I've noted your team size (50 seats) and interest in custom workspace deployment. May I have your email and company name to prepare a tailored onboarding plan for our team?",
    sourceAttribution: "Enterprise Plan Knowledge & Workspace Capabilities",
    actionPill: "Lead Capture Workflow · Contact info prompt prepared",
    actionStatus: "ready",
  },
];

const FAQS = [
  {
    question: "What is NOVA Business AI?",
    answer: "NOVA Business AI is a connected business intelligence platform that brings together website analysis, project-based knowledge bases, AI-powered customer conversations, and controlled workflows. It doesn't just answer questions — it executes authorized business actions.",
  },
  {
    question: "How does NOVA use website information?",
    answer: "Using our Website Discovery service, NOVA safely scans your connected domain, analyzes webpage structures, platform details, and business offerings, and indexes that information into a secure, project-isolated knowledge base for grounded responses.",
  },
  {
    question: "Can I configure different projects?",
    answer: "Yes. NOVA is multi-tenant and project-centric. You can create distinct projects for different websites, brands, or departments — each with its own knowledge base, system prompt persona, widget styling, and integration settings.",
  },
  {
    question: "Which integrations are supported?",
    answer: "NOVA currently supports embeddable website widgets (WordPress, Shopify, Webflow, custom HTML), WhatsApp Business channels, Shopify store connections, outbound Webhooks, GitHub, and custom REST API endpoints.",
  },
  {
    question: "Can NOVA perform actions automatically?",
    answer: "High-risk actions require human-in-the-loop approval. NOVA prepares the workflow payload and requests explicit confirmation before mutating live data, protecting your business against unauthorized automated operations.",
  },
  {
    question: "How are permissions handled?",
    answer: "Permissions follow strict role-based access control (Owner, Admin, Super Admin). Organization scopes are isolated at the database level, preventing cross-tenant data leakage.",
  },
  {
    question: "How do I get started?",
    answer: "Click 'Start Building' to sign in with Google. You can immediately create a project, input your website URL for automatic analysis, test your AI assistant in the sandbox, and embed the chat widget on your site with one line of code.",
  },
  {
    question: "Where can I find pricing or subscription details?",
    answer: "You can start immediately with the Free Trial to test all core capabilities. Pro Business plans are available inside the Project Billing & Plan section with transparent monthly billing.",
  },
];

export default function Home() {
  useSEO({
    title: "NOVA Business AI — From Conversations to Business Actions",
    description: "Connect your business knowledge, support customers, and move work forward with AI — all in one connected platform.",
    keywords: "NOVA Business AI, business AI, website intelligence, AI chatbot, RAG knowledge base, customer support AI, business automation",
    canonicalPath: "",
  });

  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { toast } = useToast();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState(DEMO_SCENARIOS[0].id);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Interactive sandbox user chat input state
  const [customInput, setCustomInput] = useState("");
  const [customChatHistory, setCustomChatHistory] = useState<Array<{ sender: "user" | "ai"; text: string; action?: string; source?: string }>>([]);
  const [isResponding, setIsResponding] = useState(false);

  const activeScenario = DEMO_SCENARIOS.find((s) => s.id === activeScenarioId) || DEMO_SCENARIOS[0];

  const handleGoogleAuth = async () => {
    try {
      setIsAuthenticating(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${basePath}/projects`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      setIsAuthenticating(false);
      toast({
        title: "Authentication failed",
        description: error.message || "Please check network or connection.",
        variant: "destructive",
      });
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim() || isResponding) return;

    const userText = customInput.trim();
    setCustomInput("");
    setCustomChatHistory((prev) => [...prev, { sender: "user", text: userText }]);
    setIsResponding(true);

    setTimeout(() => {
      let aiText = "Thank you for asking. Based on NOVA's verified business knowledge, I can assist your visitors 24/7 with relevant details. To configure this live on your site, start by connecting your website URL.";
      let actionText = "Knowledge Search Complete · Grounded in project profile";

      const lower = userText.toLowerCase();
      if (lower.includes("price") || lower.includes("cost") || lower.includes("plan")) {
        aiText = "NOVA offers a Free Trial for testing website discovery and chat, with Pro Business options for high-volume automated actions and live integrations.";
        actionText = "Plan Inquiry Workflow · Directs to Billing";
      } else if (lower.includes("support") || lower.includes("contact") || lower.includes("help")) {
        aiText = "Our support team and live AI assistant are ready to assist. You can explore the interactive demo project or launch your own workspace in under 2 minutes.";
        actionText = "Support Routing Action · Ready for workspace owner";
      } else if (lower.includes("website") || lower.includes("connect")) {
        aiText = "NOVA automatically scans your website structure, extracts key product capabilities, and generates a business intelligence profile with zero manual setup.";
        actionText = "Website Intelligence 2.0 · Ready to analyze";
      }

      setCustomChatHistory((prev) => [
        ...prev,
        {
          sender: "ai",
          text: aiText,
          source: "NOVA Business Knowledge Base",
          action: actionText,
        },
      ]);
      setIsResponding(false);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-[#0b0a12] text-[#f4f2fb] selection:bg-[#8b7bff]/30 selection:text-white flex flex-col relative overflow-x-hidden">
      {/* ── Background Glow & Radial Accents ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 -top-[140px] w-[900px] max-w-[140%] h-[700px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(139,123,255,0.22),transparent_70%)]" />
        <div className="absolute right-[-10%] top-[40%] w-[550px] h-[550px] rounded-full bg-[radial-gradient(closest-side,rgba(255,138,76,0.12),transparent_75%)]" />
        <div className="absolute left-[-10%] bottom-[10%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(closest-side,rgba(55,214,196,0.12),transparent_75%)]" />
        <div 
          className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}
        />
      </div>

      {/* ── Navigation ── */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#0b0a12]/80 border-b border-white/[0.08] transition-all">
        <div className="max-w-[1140px] mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          {/* Official NOVA Brand Logo */}
          <a href="#" className="flex items-center transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b7bff] rounded-lg">
            <NovaBrand variant="full" theme="dark" height={32} />
          </a>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-7 text-sm font-medium text-[#a09db4]">
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="#demo" className="hover:text-white transition-colors">Interactive Demo</a>
            <a href="#capabilities" className="hover:text-white transition-colors">Capabilities</a>
            <a href="#trust" className="hover:text-white transition-colors">Trust & Control</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            {user ? (
              <Button
                onClick={() => setLocation("/projects")}
                className="rounded-full bg-gradient-to-r from-[#ff8a4c] to-[#8b7bff] text-white font-semibold text-xs h-9 px-4.5 shadow-[0_4px_20px_rgba(139,123,255,0.3)] hover:opacity-95 cursor-pointer border-0"
              >
                Go to Workspace <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setLocation("/projects/demo")}
                  className="rounded-full text-xs text-[#a09db4] hover:text-white hover:bg-white/[0.06] h-9 px-3.5"
                >
                  Explore Demo
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation("/sign-in")}
                  className="rounded-full text-xs text-[#f4f2fb] bg-[#171624] border-white/[0.12] hover:bg-[#201e30] h-9 px-4"
                >
                  Sign In
                </Button>
                <Button
                  onClick={handleGoogleAuth}
                  disabled={isAuthenticating}
                  className="rounded-full bg-gradient-to-r from-[#ff8a4c] to-[#8b7bff] text-white font-semibold text-xs h-9 px-4 shadow-[0_4px_20px_rgba(139,123,255,0.3)] hover:opacity-95 cursor-pointer border-0"
                >
                  {isAuthenticating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                  Start Building
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            className="md:hidden p-2 text-[#a09db4] hover:text-white rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b7bff]"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-b border-white/[0.08] bg-[#13121d] px-6 py-5 space-y-4"
            >
              <div className="flex flex-col space-y-3 text-sm text-[#a09db4]">
                <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="hover:text-white py-1">How It Works</a>
                <a href="#demo" onClick={() => setMobileMenuOpen(false)} className="hover:text-white py-1">Interactive Demo</a>
                <a href="#capabilities" onClick={() => setMobileMenuOpen(false)} className="hover:text-white py-1">Capabilities</a>
                <a href="#trust" onClick={() => setMobileMenuOpen(false)} className="hover:text-white py-1">Trust & Control</a>
                <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="hover:text-white py-1">FAQ</a>
              </div>
              <div className="pt-3 border-t border-white/[0.08] flex flex-col gap-2.5">
                {user ? (
                  <Button
                    onClick={() => { setMobileMenuOpen(false); setLocation("/projects"); }}
                    className="w-full rounded-full bg-gradient-to-r from-[#ff8a4c] to-[#8b7bff] text-white font-semibold text-xs h-10 border-0"
                  >
                    Go to Workspace
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => { setMobileMenuOpen(false); setLocation("/projects/demo"); }}
                      className="w-full rounded-full text-xs text-[#a09db4] bg-white/[0.03] border-white/10 h-10"
                    >
                      Explore Demo Project
                    </Button>
                    <Button
                      onClick={handleGoogleAuth}
                      disabled={isAuthenticating}
                      className="w-full rounded-full bg-gradient-to-r from-[#ff8a4c] to-[#8b7bff] text-white font-semibold text-xs h-10 border-0"
                    >
                      {isAuthenticating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                      Start Building Free
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ── Main Hero Section ── */}
      <header className="relative z-10 pt-16 md:pt-24 pb-16 md:pb-20 text-center px-5 sm:px-6">
        <div className="max-w-[1020px] mx-auto">
          {/* Eyebrow Tag */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/[0.12] bg-[#171624] text-xs text-[#a09db4] mb-6 shadow-sm"
          >
            <span className="w-2 h-2 rounded-full bg-[#37d6c4] animate-pulse" />
            <span className="font-medium text-slate-200">NOVA Business AI</span>
            <span className="text-white/20">|</span>
            <span>From Conversations to Business Actions</span>
          </motion.div>

          {/* Primary Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-6xl md:text-7xl font-normal font-serif tracking-tight text-white leading-[1.08] max-w-[880px] mx-auto"
          >
            From conversations to <span className="grad italic font-serif">business actions.</span>
          </motion.h1>

          {/* Supporting Lead Text */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-base sm:text-lg md:text-xl text-[#a09db4] max-w-[660px] mx-auto leading-relaxed"
          >
            Connect your business knowledge, support customers, and move work forward with AI — all in one connected platform.
          </motion.p>

          {/* Hero CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5"
          >
            <Button
              onClick={handleGoogleAuth}
              disabled={isAuthenticating}
              size="lg"
              className="w-full sm:w-auto text-sm font-semibold h-12 px-7 rounded-full bg-gradient-to-r from-[#ff8a4c] to-[#8b7bff] text-white shadow-[0_8px_30px_rgba(139,123,255,0.3)] hover:opacity-95 border-0 cursor-pointer"
            >
              {isAuthenticating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2 text-white/90" />}
              Start Building with NOVA
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                const el = document.getElementById("demo");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              className="w-full sm:w-auto text-sm font-semibold h-12 px-6 rounded-full bg-[#171624] border-white/[0.12] text-white hover:bg-[#201e30] cursor-pointer"
            >
              Explore Interactive Demo <ArrowRight className="w-4 h-4 ml-1.5 text-[#a09db4]" />
            </Button>
          </motion.div>

          {/* Product Preview Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="max-w-[620px] mx-auto mt-12 text-left bg-[#171624] border border-white/[0.12] rounded-2xl md:rounded-3xl p-5 sm:p-6 shadow-[0_30px_80px_rgba(139,123,255,0.22)] backdrop-blur-xl"
          >
            {/* Window Dots */}
            <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-[#a09db4]/80">
                <Globe className="w-3 h-3 text-[#37d6c4]" />
                <span>Connected Website AI Preview</span>
              </div>
            </div>

            {/* Chat Interaction */}
            <div className="space-y-3 text-sm">
              <div className="max-w-[85%] ml-auto bg-[#13121d] border border-white/[0.06] text-slate-200 px-4 py-2.5 rounded-2xl rounded-br-xs text-sm">
                Do you offer same-day delivery to Coimbatore?
              </div>

              <div className="max-w-[90%] bg-gradient-to-r from-[#8b7bff]/20 via-[#ff8a4c]/10 to-transparent border border-white/[0.08] text-white px-4 py-3 rounded-2xl rounded-bl-xs text-sm leading-relaxed">
                Yes. Orders placed before 2:00 PM ship same day in Coimbatore. Want me to check your order tracking status?
              </div>

              {/* Source & Safeguard Pill */}
              <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-[#37d6c4]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#37d6c4] animate-pulse" />
                  <span className="text-[12px] font-medium truncate">
                    Searched website knowledge · Action ready, awaiting approval
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.06] self-start sm:self-auto">
                  Safe Sandbox
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </header>

      {/* ── Section C: Interactive Product Demo ── */}
      <section id="demo" className="relative z-10 py-16 md:py-24 border-t border-white/[0.08] bg-[#0e0d17]/60">
        <div className="max-w-[1140px] mx-auto px-5 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-[#ff8a4c] block mb-2">
              Interactive Live Demo
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif tracking-tight text-white leading-tight">
              Test how NOVA <span className="grad italic font-serif">serves customers.</span>
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#a09db4]">
              Select a verified scenario below or ask your own question to inspect real source grounding and action controls.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Scenario Selectors */}
            <div className="lg:col-span-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#a09db4] px-1">
                Choose a business scenario:
              </p>
              {DEMO_SCENARIOS.map((sc) => {
                const isSelected = sc.id === activeScenarioId;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => {
                      setActiveScenarioId(sc.id);
                      setCustomChatHistory([]);
                    }}
                    className={`w-full p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#171624] border-[#8b7bff] shadow-[0_0_24px_rgba(139,123,255,0.18)]"
                        : "bg-[#13121d]/80 border-white/[0.08] hover:bg-[#171624]/60 hover:border-white/[0.14]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-[#ff8a4c] uppercase tracking-wider">
                        {sc.badge}
                      </span>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#37d6c4] font-medium bg-[#37d6c4]/10 px-2 py-0.5 rounded-full border border-[#37d6c4]/20">
                          <Check className="w-3 h-3" /> Selected
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-white mb-1">{sc.title}</h3>
                    <p className="text-xs text-[#a09db4] line-clamp-1 italic">
                      "{sc.userMessage}"
                    </p>
                  </button>
                );
              })}

              <div className="p-4 rounded-2xl bg-[#171624]/40 border border-white/[0.06] text-xs text-[#a09db4]">
                <div className="flex items-center gap-2 text-white font-medium mb-1">
                  <ShieldCheck className="w-4 h-4 text-[#37d6c4]" />
                  <span>Verified Safe Execution</span>
                </div>
                Marketing demo is sandboxed. Real external tool execution (SMS, Shopify mutations, database writes) requires workspace authorization.
              </div>
            </div>

            {/* Right Column: Interactive Chat Canvas */}
            <div className="lg:col-span-7 bg-[#171624] border border-white/[0.12] rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col min-h-[460px]">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#ff8a4c]/30 to-[#8b7bff]/30 border border-white/10 flex items-center justify-center text-white">
                    <Sparkles className="w-4 h-4 text-[#ff8a4c]" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">NOVA Assistant Sandbox</h4>
                    <p className="text-[11px] text-[#a09db4]">Grounded in Business Knowledge</p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-[#37d6c4] bg-[#37d6c4]/10 border border-[#37d6c4]/20 px-2.5 py-1 rounded-full">
                  Live Response
                </span>
              </div>

              {/* Message Stream */}
              <div className="flex-1 space-y-4 overflow-y-auto max-h-[340px] pr-1">
                {/* Initial scenario user question */}
                <div className="max-w-[85%] ml-auto bg-[#13121d] border border-white/[0.08] text-slate-200 px-4 py-2.5 rounded-2xl rounded-br-xs text-sm">
                  {activeScenario.userMessage}
                </div>

                {/* Scenario AI response */}
                <div className="space-y-2">
                  <div className="max-w-[90%] bg-gradient-to-r from-[#8b7bff]/20 via-[#ff8a4c]/10 to-[#13121d]/40 border border-white/[0.08] text-white px-4 py-3 rounded-2xl rounded-bl-xs text-sm leading-relaxed">
                    {activeScenario.aiResponse}
                  </div>

                  {/* Metadata cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                    <div className="p-2.5 rounded-xl bg-[#13121d] border border-white/[0.06] text-[#a09db4] flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-[#ff8a4c] shrink-0" />
                      <span className="truncate" title={activeScenario.sourceAttribution}>
                        {activeScenario.sourceAttribution}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#13121d] border border-white/[0.06] text-[#37d6c4] flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-[#37d6c4] shrink-0" />
                      <span className="truncate" title={activeScenario.actionPill}>
                        {activeScenario.actionPill}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Additional user questions in history */}
                {customChatHistory.map((item, idx) => (
                  <div key={idx} className="space-y-2">
                    {item.sender === "user" ? (
                      <div className="max-w-[85%] ml-auto bg-[#13121d] border border-white/[0.08] text-slate-200 px-4 py-2.5 rounded-2xl rounded-br-xs text-sm">
                        {item.text}
                      </div>
                    ) : (
                      <>
                        <div className="max-w-[90%] bg-gradient-to-r from-[#8b7bff]/20 via-[#ff8a4c]/10 to-[#13121d]/40 border border-white/[0.08] text-white px-4 py-3 rounded-2xl rounded-bl-xs text-sm leading-relaxed">
                          {item.text}
                        </div>
                        {item.action && (
                          <div className="p-2.5 rounded-xl bg-[#13121d] border border-white/[0.06] text-[#37d6c4] text-xs flex items-center gap-2">
                            <Cpu className="w-3.5 h-3.5 text-[#37d6c4] shrink-0" />
                            <span className="truncate">{item.action}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}

                {isResponding && (
                  <div className="flex items-center gap-2 text-xs text-[#a09db4] p-2">
                    <Loader2 className="w-4 h-4 animate-spin text-[#8b7bff]" />
                    <span>NOVA AI searching project knowledge...</span>
                  </div>
                )}
              </div>

                {/* Input Box for custom question */}
                <form onSubmit={handleCustomSubmit} className="mt-4 pt-3 border-t border-white/[0.08] flex items-center gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Ask a custom question in the sandbox..."
                  aria-label="Custom sandbox question"
                  className="flex-1 bg-[#13121d] border border-white/[0.1] rounded-xl px-4 py-2.5 text-xs text-white placeholder-[#a09db4]/60 focus:outline-none focus:border-[#8b7bff]"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!customInput.trim() || isResponding}
                  className="rounded-xl bg-gradient-to-r from-[#ff8a4c] to-[#8b7bff] text-white font-medium text-xs h-9 px-3.5 border-0 shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section D: How NOVA Works ── */}
      <section id="how-it-works" className="relative z-10 py-20 md:py-28">
        <div className="max-w-[1140px] mx-auto px-5 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-[#ff8a4c] block mb-2">
              Structured Journey
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif tracking-tight text-white leading-tight">
              Useful AI. Clear control. <span className="grad italic font-serif">Better workflows.</span>
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#a09db4]">
              Four seamless steps to connect your company knowledge and turn conversations into real business momentum.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Step 1 */}
            <div className="p-6 rounded-2xl bg-[#171624] border border-white/[0.08] relative group hover:border-[#8b7bff]/50 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#ff8a4c]/15 text-[#ff8a4c] font-bold text-sm flex items-center justify-center mb-5 border border-[#ff8a4c]/20">
                01
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Connect</h3>
              <p className="text-xs text-[#a09db4] leading-relaxed">
                Add your website URL, document sources, or supported service accounts. Safe SSRF verification guarantees protected access.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-6 rounded-2xl bg-[#171624] border border-white/[0.08] relative group hover:border-[#8b7bff]/50 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#8b7bff]/15 text-[#8b7bff] font-bold text-sm flex items-center justify-center mb-5 border border-[#8b7bff]/20">
                02
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Understand</h3>
              <p className="text-xs text-[#a09db4] leading-relaxed">
                Automated discovery extracts sitemaps, page headings, service offerings, and capabilities into a structured business profile.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-6 rounded-2xl bg-[#171624] border border-white/[0.08] relative group hover:border-[#8b7bff]/50 transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#37d6c4]/15 text-[#37d6c4] font-bold text-sm flex items-center justify-center mb-5 border border-[#37d6c4]/20">
                03
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Respond</h3>
              <p className="text-xs text-[#a09db4] leading-relaxed">
                Deploy an AI assistant grounded strictly in verified knowledge, answering customer inquiries 24/7 with transparent citations.
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-6 rounded-2xl bg-[#171624] border border-white/[0.08] relative group hover:border-[#8b7bff]/50 transition-all">
              <div className="w-10 h-10 rounded-xl bg-violet-400/15 text-violet-300 font-bold text-sm flex items-center justify-center mb-5 border border-violet-400/20">
                04
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Act</h3>
              <p className="text-xs text-[#a09db4] leading-relaxed">
                Prepare or execute approved workflows (lead capture, notification alerts, order inquiries) with human-in-the-loop safeguards.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section E: Product Capabilities Bento Grid ── */}
      <section id="capabilities" className="relative z-10 py-20 md:py-28 border-t border-white/[0.08] bg-[#0e0d17]/50">
        <div className="max-w-[1140px] mx-auto px-5 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-[#ff8a4c] block mb-2">
              Every Capability
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif tracking-tight text-white leading-tight">
              One platform. <span className="grad italic font-serif">Every business superpower.</span>
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#a09db4]">
              Verified systems built for enterprise reliability, continuous indexing, and controlled execution.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Card 1: Wide */}
            <div className="lg:col-span-2 p-7 rounded-3xl bg-[#171624] border border-white/[0.08] hover:border-[#8b7bff]/40 transition-all group">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#ff8a4c]/20 to-[#8b7bff]/20 flex items-center justify-center text-[#ff8a4c] mb-5 border border-white/10">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">AI-Powered Customer Conversations</h3>
              <p className="text-sm text-[#a09db4] leading-relaxed mb-4">
                Embed a responsive streaming chatbot into any website with 1 line of script. Answers customer queries with real-time token streaming, Markdown formatting, and transparent source grounding.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground font-mono">
                <span className="bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">Custom Widget Styling</span>
                <span className="bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">Realtime SSE Streaming</span>
                <span className="bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">Visitor Inbox</span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="p-7 rounded-3xl bg-[#171624] border border-white/[0.08] hover:border-[#8b7bff]/40 transition-all group">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#8b7bff]/20 to-[#37d6c4]/20 flex items-center justify-center text-[#37d6c4] mb-5 border border-white/10">
                <Globe className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Website Intelligence 2.0</h3>
              <p className="text-sm text-[#a09db4] leading-relaxed mb-4">
                Automated discovery parses page navigation, CMS platform, and business offerings with full SSRF and private-IP protection.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground font-mono">
                <span className="bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">Domain Origin Check</span>
                <span className="bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">Capability Detection</span>
              </div>
            </div>

            {/* Card 3 */}
            <div className="p-7 rounded-3xl bg-[#171624] border border-white/[0.08] hover:border-[#8b7bff]/40 transition-all group">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#37d6c4]/20 to-[#ff8a4c]/20 flex items-center justify-center text-[#ff8a4c] mb-5 border border-white/10">
                <Database className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Business Knowledge & RAG</h3>
              <p className="text-sm text-[#a09db4] leading-relaxed mb-4">
                Connect unstructured documentation, text files, and website content into high-accuracy semantic embeddings with pgvector retrieval.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground font-mono">
                <span className="bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">Document Indexing</span>
                <span className="bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">Citation Transparency</span>
              </div>
            </div>

            {/* Card 4 */}
            <div className="p-7 rounded-3xl bg-[#171624] border border-white/[0.08] hover:border-[#8b7bff]/40 transition-all group">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500/20 to-[#ff8a4c]/20 flex items-center justify-center text-violet-400 mb-5 border border-white/10">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Intelligent Workflows</h3>
              <p className="text-sm text-[#a09db4] leading-relaxed mb-4">
                Execute structured business actions with approval tokens and human oversight. Never allows autonomous unauthorized mutations.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground font-mono">
                <span className="bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">Approval Guardrails</span>
                <span className="bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">Execution Audit Trail</span>
              </div>
            </div>

            {/* Card 5 */}
            <div className="p-7 rounded-3xl bg-[#171624] border border-white/[0.08] hover:border-[#8b7bff]/40 transition-all group">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#ff8a4c]/20 to-[#8b7bff]/20 flex items-center justify-center text-[#ff8a4c] mb-5 border border-white/10">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Connected Services</h3>
              <p className="text-sm text-[#a09db4] leading-relaxed mb-4">
                Integrate with Shopify, WhatsApp Business, Webhook dispatchers, and external APIs with secure token encryption.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground font-mono">
                <span className="bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">Shopify & WhatsApp</span>
                <span className="bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">Webhook Events</span>
              </div>
            </div>

            {/* Card 6: Full Width */}
            <div className="lg:col-span-3 p-7 rounded-3xl bg-[#171624] border border-white/[0.08] hover:border-[#8b7bff]/40 transition-all group">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#8b7bff]/20 to-[#ff8a4c]/20 flex items-center justify-center text-[#8b7bff] mb-5 border border-white/10">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Project Workspaces & Governance</h3>
              <p className="text-sm text-[#a09db4] leading-relaxed mb-4 max-w-3xl">
                Organize projects cleanly with role-based access, dedicated API keys, audit logging, and team permissions. Perfect for agencies, multi-brand companies, and growing product teams.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground font-mono">
                <span className="bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">Multi-Tenant Isolation</span>
                <span className="bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">Role-Based Access</span>
                <span className="bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">API Key Rotation</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section F: Practical Use Cases ── */}
      <section id="use-cases" className="relative z-10 py-20 md:py-28">
        <div className="max-w-[1140px] mx-auto px-5 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-[#ff8a4c] block mb-2">
              Proven Scenarios
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif tracking-tight text-white leading-tight">
              Built for practical <span className="grad italic font-serif">business results.</span>
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#a09db4]">
              How real teams use NOVA to solve everyday operational challenges and boost customer satisfaction.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 sm:p-7 rounded-3xl bg-[#171624] border border-white/[0.08] space-y-3">
              <span className="text-xs font-mono text-[#ff8a4c] bg-[#ff8a4c]/10 px-2.5 py-1 rounded-md border border-[#ff8a4c]/20">
                Customer Support
              </span>
              <h3 className="text-xl font-bold text-white">Answering Repetitive Customer Questions</h3>
              <p className="text-xs sm:text-sm text-[#a09db4] leading-relaxed">
                Eliminate repetitive tier-1 support tickets. NOVA answers questions regarding shipping policies, refund terms, pricing plans, and business hours 24/7 without manual staff overhead.
              </p>
            </div>

            <div className="p-6 sm:p-7 rounded-3xl bg-[#171624] border border-white/[0.08] space-y-3">
              <span className="text-xs font-mono text-[#8b7bff] bg-[#8b7bff]/10 px-2.5 py-1 rounded-md border border-[#8b7bff]/20">
                Sales & Inbound
              </span>
              <h3 className="text-xl font-bold text-white">Capturing & Qualifying Website Leads</h3>
              <p className="text-xs sm:text-sm text-[#a09db4] leading-relaxed">
                Engage website visitors when intent is highest. Collect contact information, qualify project requirements, and route inquiries directly to your team via Visitor Inbox and Webhooks.
              </p>
            </div>

            <div className="p-6 sm:p-7 rounded-3xl bg-[#171624] border border-white/[0.08] space-y-3">
              <span className="text-xs font-mono text-[#37d6c4] bg-[#37d6c4]/10 px-2.5 py-1 rounded-md border border-[#37d6c4]/20">
                Knowledge Access
              </span>
              <h3 className="text-xl font-bold text-white">Instant Answers Across Business Documentation</h3>
              <p className="text-xs sm:text-sm text-[#a09db4] leading-relaxed">
                Stop hunting through disparate PDFs and Notion docs. Teams search across unified project knowledge bases and receive accurate answers with verbatim citations in seconds.
              </p>
            </div>

            <div className="p-6 sm:p-7 rounded-3xl bg-[#171624] border border-white/[0.08] space-y-3">
              <span className="text-xs font-mono text-purple-300 bg-purple-500/10 px-2.5 py-1 rounded-md border border-purple-500/20">
                Agency & Multi-Brand
              </span>
              <h3 className="text-xl font-bold text-white">Managing Multiple AI Projects Under One Roof</h3>
              <p className="text-xs sm:text-sm text-[#a09db4] leading-relaxed">
                Agencies and businesses managing multiple websites create isolated workspaces for each client or brand, with independent knowledge bases, styling, and usage analytics.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section G: Trust, Control & Security ── */}
      <section id="trust" className="relative z-10 py-20 md:py-28 border-t border-white/[0.08] bg-[#0e0d17]/60">
        <div className="max-w-[1140px] mx-auto px-5 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-[#37d6c4] block mb-2">
              Enterprise Safeguards
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif tracking-tight text-white leading-tight">
              Verified security and <span className="grad italic font-serif">human control.</span>
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#a09db4]">
              We believe business AI must be controlled, safe, and transparent. Here is how we enforce it.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="p-6 rounded-2xl bg-[#171624] border border-white/[0.08]">
              <div className="w-9 h-9 rounded-xl bg-[#37d6c4]/15 text-[#37d6c4] flex items-center justify-center mb-4">
                <Lock className="w-4.5 h-4.5" />
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">Tenant Isolation</h3>
              <p className="text-xs text-[#a09db4] leading-relaxed">
                Strict organization boundaries in PostgreSQL ensure your projects, conversations, and knowledge sources are completely partitioned.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#171624] border border-white/[0.08]">
              <div className="w-9 h-9 rounded-xl bg-[#ff8a4c]/15 text-[#ff8a4c] flex items-center justify-center mb-4">
                <ShieldCheck className="w-4.5 h-4.5" />
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">Approval Guardrails</h3>
              <p className="text-xs text-[#a09db4] leading-relaxed">
                Workflows with high-risk mutations require signed approval tokens. NOVA never performs arbitrary unattended external actions.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#171624] border border-white/[0.08]">
              <div className="w-9 h-9 rounded-xl bg-[#8b7bff]/15 text-[#8b7bff] flex items-center justify-center mb-4">
                <Shield className="w-4.5 h-4.5" />
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">SSRF Protection</h3>
              <p className="text-xs text-[#a09db4] leading-relaxed">
                Website discovery strictly blocks private IP ranges, loopback addresses, and redirect loops to protect internal cloud infrastructure.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#171624] border border-white/[0.08]">
              <div className="w-9 h-9 rounded-xl bg-violet-400/15 text-violet-300 flex items-center justify-center mb-4">
                <Key className="w-4.5 h-4.5" />
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">Encrypted Secrets</h3>
              <p className="text-xs text-[#a09db4] leading-relaxed">
                Connected service tokens, third-party credentials, and project API keys are encrypted at rest using AES-256-GCM.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section H: FAQ Section ── */}
      <section id="faq" className="relative z-10 py-20 md:py-28">
        <div className="max-w-[840px] mx-auto px-5 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-[#ff8a4c] block mb-2">
              Frequently Asked Questions
            </span>
            <h2 className="text-3xl sm:text-4xl font-serif tracking-tight text-white leading-tight">
              Clear answers to <span className="grad italic font-serif">common questions.</span>
            </h2>
          </div>

          <div className="space-y-3.5">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-white/[0.08] bg-[#171624] overflow-hidden transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b7bff]"
                  >
                    <span className="text-sm font-semibold text-white">{faq.question}</span>
                    <ChevronDown className={`w-4 h-4 text-[#a09db4] shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180 text-white" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="px-5 pb-5 pt-0 text-xs sm:text-sm text-[#a09db4] leading-relaxed border-t border-white/[0.04]"
                      >
                        {faq.answer}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Section I: Final Conversion CTA ── */}
      <section id="start" className="relative z-10 py-16 md:py-24 px-5 sm:px-6">
        <div className="max-w-[940px] mx-auto p-8 sm:p-14 md:p-16 rounded-3xl md:rounded-[36px] bg-[#171624] border border-white/[0.12] text-center relative overflow-hidden shadow-[0_20px_70px_rgba(139,123,255,0.22)]">
          {/* Radial Aura Background */}
          <div className="absolute inset-0 bg-[radial-gradient(70%_120%_at_50%_120%,rgba(139,123,255,0.32),transparent)] pointer-events-none" />

          <div className="relative z-10">
            <span className="text-xs font-bold uppercase tracking-widest text-[#ff8a4c] block mb-3">
              Let's build smarter
            </span>
            <h2 className="text-3xl sm:text-5xl font-serif tracking-tight text-white leading-tight max-w-2xl mx-auto">
              Turn your business goals into <span className="grad italic font-serif">AI-powered workflows.</span>
            </h2>
            <p className="mt-4 text-sm sm:text-base text-[#a09db4] max-w-lg mx-auto leading-relaxed">
              Connect your website, organize your business knowledge, and let AI serve customers with real capabilities.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <Button
                onClick={handleGoogleAuth}
                disabled={isAuthenticating}
                size="lg"
                className="w-full sm:w-auto text-sm font-semibold h-12 px-8 rounded-full bg-gradient-to-r from-[#ff8a4c] to-[#8b7bff] text-white shadow-[0_8px_30px_rgba(139,123,255,0.4)] hover:opacity-95 border-0 cursor-pointer"
              >
                {isAuthenticating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rocket className="w-4 h-4 mr-2" />}
                Start Building Free
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setLocation("/projects/demo")}
                className="w-full sm:w-auto text-sm font-semibold h-12 px-7 rounded-full bg-[#13121d] border-white/[0.14] text-white hover:bg-white/[0.08] cursor-pointer"
              >
                Explore Interactive Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section J: Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.08] bg-[#0b0a12] py-12 px-5 sm:px-6 text-xs text-[#a09db4]">
        <div className="max-w-[1140px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <NovaBrand variant="full" theme="dark" height={26} />
            <span className="text-white/20">|</span>
            <span className="text-[11px] text-[#a09db4]">From Conversations to Business Actions</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs">
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="#demo" className="hover:text-white transition-colors">Demo</a>
            <a href="#capabilities" className="hover:text-white transition-colors">Capabilities</a>
            <a href="#trust" className="hover:text-white transition-colors">Trust & Security</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
            <button type="button" onClick={() => setLocation("/sign-in")} className="hover:text-white transition-colors cursor-pointer">Sign In</button>
          </div>

          <div className="text-[11px] text-[#a09db4]/70 text-center md:text-right">
            © {new Date().getFullYear()} NOVA Business AI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
