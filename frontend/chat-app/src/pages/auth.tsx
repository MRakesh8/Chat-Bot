import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { supabase } from "../lib/supabase";
import { useSEO } from "@/hooks/use-seo";
import {
  Loader2,
  MessageSquare,
  Database,
  Search,
  Bot,
  Sun,
  Moon,
  Sparkles,
  ShieldCheck,
  ArrowLeft,
  Lock,
} from "lucide-react";
import { NovaBrand } from "@/components/ui/nova-brand";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const features = [
  {
    icon: MessageSquare,
    title: "AI Conversations",
    description: "Multi-turn assistant grounded in your business knowledge.",
  },
  {
    icon: Database,
    title: "Project Knowledge",
    description: "Instant semantic RAG across websites, documents, and files.",
  },
  {
    icon: Bot,
    title: "Automated Actions",
    description: "Execute multi-step tasks across connected tools with human oversight.",
  },
  {
    icon: Search,
    title: "Multi-Provider AI",
    description: "Optimized enterprise routing across Gemini, Claude, and GPT-4o.",
  },
];

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const [legalModal, setLegalModal] = useState<"terms" | "privacy" | null>(null);

  const { user, loginAsDemo } = useAuth();
  const { effectiveMode, setTheme } = useTheme();
  const [, setLocation] = useLocation();
  const shouldReduceMotion = useReducedMotion();

  const isDark = effectiveMode === "dark";

  // SEO configuration matching landing page standards
  useSEO({
    title: "Sign in — NOVA Business AI",
    description:
      "Sign in to your NOVA Business AI workspace. Connect conversations to real business actions, project knowledge bases, and custom automated assistants.",
    canonicalPath: "/sign-in",
  });

  // Preserve redirect if user is already authenticated
  useEffect(() => {
    if (user && !isSuccess) {
      setLocation("/");
    }
  }, [user, isSuccess, setLocation]);

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      setError("");

      // IMPORTANT: Always use the direct supabase client (never the proxy) for OAuth.
      // PKCE flow stores a code_verifier in sessionStorage during signInWithOAuth,
      // and the same client instance must be used when the browser returns from Google
      // (handled by AuthContext's onAuthStateChange). Using a proxy client creates a
      // different storage key, causing 400/422 errors on token exchange.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/projects`,
        },
      });

      if (error) throw error;
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to authenticate with Google. Please try again.");
      setIsLoading(false);
    }
  };

  const handleDemoLogin = () => {
    loginAsDemo();
    setLocation("/projects");
  };

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col justify-between bg-background text-foreground transition-colors duration-300 font-sans overflow-x-hidden selection:bg-primary/20 selection:text-primary">
      {/* ── Ambient Background Layer (Theme-Aware Brand Glows) ── */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Top-left Brand Coral Glow */}
        <motion.div
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  scale: [1, 1.15, 1],
                  opacity: isDark ? [0.12, 0.22, 0.12] : [0.08, 0.15, 0.08],
                  x: [0, 40, 0],
                  y: [0, -30, 0],
                }
          }
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[15%] -left-[10%] w-[55vw] max-w-[700px] h-[55vw] max-h-[700px] rounded-full blur-[130px]"
          style={{
            backgroundColor: isDark ? "rgba(228, 119, 85, 0.18)" : "rgba(188, 76, 45, 0.12)",
          }}
        />

        {/* Bottom-right Brand Forest / Teal Glow */}
        <motion.div
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  scale: [1, 1.25, 1],
                  opacity: isDark ? [0.1, 0.2, 0.1] : [0.06, 0.12, 0.06],
                  x: [0, -40, 0],
                  y: [0, 40, 0],
                }
          }
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-[15%] -right-[10%] w-[60vw] max-w-[750px] h-[60vw] max-h-[750px] rounded-full blur-[140px]"
          style={{
            backgroundColor: isDark ? "rgba(85, 182, 165, 0.15)" : "rgba(22, 121, 111, 0.1)",
          }}
        />

        {/* Center-accent Warm Marigold Glow */}
        <motion.div
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  scale: [1, 1.1, 1],
                  opacity: isDark ? [0.06, 0.12, 0.06] : [0.05, 0.1, 0.05],
                }
          }
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[35%] left-[25%] w-[40vw] max-w-[500px] h-[40vw] max-h-[500px] rounded-full blur-[160px]"
          style={{
            backgroundColor: isDark ? "rgba(232, 184, 73, 0.1)" : "rgba(232, 184, 73, 0.08)",
          }}
        />

        {/* Tactile paper texture overlay */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{
            opacity: isDark ? 0.035 : 0.04,
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")',
          }}
        />
      </div>

      {/* ── Top Header / Navigation ── */}
      <header className="relative z-20 w-full px-5 sm:px-8 lg:px-14 py-4 sm:py-6 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 group transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xl"
          aria-label="Return to NOVA Business AI home"
        >
          <NovaBrand variant="full" theme={isDark ? "dark" : "light"} height={32} />
        </Link>

        <div className="flex items-center gap-3">
          {/* Back to Home Link */}
          <Link
            href="/"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg border border-transparent hover:border-border transition-all"
            aria-label="Back to landing page"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to website</span>
          </Link>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-border bg-card/80 hover:bg-card text-foreground transition-all duration-200 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={isDark}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            )}
          </button>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <main className="relative z-10 flex-1 flex items-center justify-center w-full px-5 sm:px-8 lg:px-14 py-6 sm:py-10">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          
          {/* ── Left Column: Editorial Brand & Core Pillars (Desktop) ── */}
          <div className="hidden lg:flex lg:col-span-7 flex-col justify-center space-y-8 pr-4">
            <motion.div
              initial={shouldReduceMotion ? undefined : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-4"
            >
              <div className="inline-flex items-center gap-2">
                <span
                  style={{ fontFamily: "'Caveat', cursive" }}
                  className="text-primary text-2xl font-semibold tracking-wide"
                >
                  Hi, welcome back 👋
                </span>
              </div>

              <h1 className="font-serif text-4xl xl:text-5xl font-bold tracking-tight text-foreground leading-[1.14]">
                From Conversations <br />
                <span className="text-primary italic font-serif">to Business Actions</span>
              </h1>

              <p className="text-muted-foreground text-base xl:text-lg leading-relaxed max-w-xl">
                Connect customer chats directly to verified knowledge and automated workflows.
                Build, test, and deploy intelligent agents with human oversight built in.
              </p>
            </motion.div>

            {/* Feature Cards Grid */}
            <motion.div
              initial={shouldReduceMotion ? undefined : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1"
            >
              {features.map((feature, idx) => (
                <div
                  key={feature.title}
                  className="group p-4 rounded-2xl border border-border/70 bg-card/60 backdrop-blur-sm hover:bg-card/90 hover:border-primary/40 transition-all duration-200"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 text-primary shrink-0 transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <feature.icon className="w-4 h-4" />
                    </div>
                    <h2 className="text-sm font-semibold text-foreground tracking-tight">
                      {feature.title}
                    </h2>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed pl-1">
                    {feature.description}
                  </p>
                </div>
              ))}
            </motion.div>

            {/* Trust and Compliance Footer Note */}
            <motion.div
              initial={shouldReduceMotion ? undefined : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="flex items-center gap-6 pt-2 text-xs text-muted-foreground border-t border-border/50"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Enterprise Data Isolation</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-500" />
                <span>Human-in-the-Loop Safeguards</span>
              </div>
            </motion.div>
          </div>

          {/* ── Right Column: Sign-in Card ── */}
          <div className="lg:col-span-5 w-full flex justify-center lg:justify-end">
            <AnimatePresence mode="wait">
              {!isSuccess ? (
                <motion.div
                  key="login-card"
                  initial={shouldReduceMotion ? undefined : { opacity: 0, y: 20, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="w-full max-w-[420px] rounded-3xl p-7 sm:p-9 border border-border/80 bg-card/90 backdrop-blur-xl shadow-2xl transition-all relative overflow-hidden"
                  style={{
                    boxShadow: isDark
                      ? "0 25px 60px -15px rgba(0, 0, 0, 0.5)"
                      : "0 20px 50px -12px rgba(32, 49, 44, 0.08)",
                  }}
                >
                  {/* Subtle top edge highlight */}
                  <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

                  {/* Mobile-only branding display */}
                  <div className="lg:hidden flex flex-col items-center mb-6 text-center">
                    <NovaBrand variant="full" theme={isDark ? "dark" : "light"} height={34} className="mb-2" />
                    <span
                      style={{ fontFamily: "'Caveat', cursive" }}
                      className="text-primary text-xl font-semibold"
                    >
                      From Conversations to Actions
                    </span>
                  </div>

                  {/* Sign-in Header */}
                  <div className="text-center lg:text-left mb-7">
                    <h2 className="font-serif text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                      Welcome to NOVA
                    </h2>
                    <p className="text-muted-foreground text-sm mt-1.5 leading-relaxed">
                      Sign in to continue to your workspace.
                    </p>
                  </div>

                  {/* Connection / Auth Error Banner */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mb-5 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs leading-relaxed text-left flex flex-col gap-1"
                      role="alert"
                    >
                      <span className="font-semibold text-destructive">Authentication Error</span>
                      <span>{error}</span>
                    </motion.div>
                  )}

                  {/* Primary Google OAuth Button */}
                  <div className="space-y-3.5">
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={isLoading}
                      className="relative group w-full h-[52px] rounded-xl font-semibold text-sm flex items-center justify-center gap-3 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm border border-border/80 bg-foreground text-background hover:opacity-90 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      aria-label="Continue with Google"
                      id="google-signin-button"
                    >
                      {isLoading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-inherit" />
                          <span>Connecting to Google...</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-3">
                          <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
                            <path
                              d="M12.0003 4.75C13.7703 4.75 15.3553 5.36002 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.28027 6.60998L5.27028 9.70498C6.21525 6.86002 8.87028 4.75 12.0003 4.75Z"
                              fill="#EA4335"
                            />
                            <path
                              d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z"
                              fill="#4285F4"
                            />
                            <path
                              d="M5.26498 14.2949C5.02498 13.5699 4.88501 12.7999 4.88501 11.9999C4.88501 11.1999 5.01998 10.4299 5.26498 9.7049L1.275 6.60986C0.46 8.22986 0 10.0599 0 11.9999C0 13.9399 0.46 15.7699 1.28 17.3899L5.26498 14.2949Z"
                              fill="#FBBC05"
                            />
                            <path
                              d="M12.0004 24.0001C15.2404 24.0001 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.8704 19.245 6.21537 17.135 5.26538 14.29L1.27539 17.385C3.25539 21.31 7.3104 24.0001 12.0004 24.0001Z"
                              fill="#34A853"
                            />
                          </svg>
                          <span>Continue with Google</span>
                        </span>
                      )}
                    </button>

                    {/* Divider */}
                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                        <span className="bg-card px-3 text-muted-foreground font-medium">
                          Or explore demo
                        </span>
                      </div>
                    </div>

                    {/* Demo / Guest Sign-in Button */}
                    <button
                      type="button"
                      onClick={handleDemoLogin}
                      className="w-full h-[46px] rounded-xl font-medium text-xs sm:text-sm flex items-center justify-center gap-2 border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-all duration-200 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      aria-label="Continue as Demo User or Guest"
                      id="demo-signin-button"
                    >
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span>Continue as Demo User / Guest</span>
                    </button>
                  </div>

                  {/* Terms and Privacy policy links */}
                  <p className="mt-6 text-center text-xs text-muted-foreground leading-relaxed">
                    By continuing, you agree to NOVA Business AI's{" "}
                    <button
                      type="button"
                      onClick={() => setLegalModal("terms")}
                      className="text-foreground hover:text-primary underline underline-offset-2 decoration-border hover:decoration-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                    >
                      Terms of Service
                    </button>{" "}
                    and{" "}
                    <button
                      type="button"
                      onClick={() => setLegalModal("privacy")}
                      className="text-foreground hover:text-primary underline underline-offset-2 decoration-border hover:decoration-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                    >
                      Privacy Policy
                    </button>
                    .
                  </p>
                </motion.div>
              ) : (
                /* Success Transition State */
                <motion.div
                  key="success-screen"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full max-w-[420px] rounded-3xl p-10 border border-border bg-card/95 backdrop-blur-xl shadow-2xl text-center space-y-4"
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                    <Loader2 className="w-7 h-7 animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="font-serif text-2xl font-bold text-foreground">
                      Welcome to NOVA
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      Taking you to your workspace...
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 w-full px-5 sm:px-8 lg:px-14 py-4 text-center text-xs text-muted-foreground/80">
        <p>© {new Date().getFullYear()} NOVA Business AI. All rights reserved.</p>
      </footer>

      {/* ── Terms of Service Dialog ── */}
      <Dialog open={legalModal === "terms"} onOpenChange={(open) => !open && setLegalModal(null)}>
        <DialogContent className="max-w-md bg-card text-foreground border-border">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Terms of Service</DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Last updated: October 2026
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-xs text-muted-foreground max-h-[60vh] overflow-y-auto pr-2 leading-relaxed">
            <p>
              Welcome to NOVA Business AI. By accessing or using our platform, you agree to comply with
              these terms of service.
            </p>
            <p className="font-semibold text-foreground">1. Account & Security</p>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and
              all activities under your organization's workspace.
            </p>
            <p className="font-semibold text-foreground">2. AI Actions & Oversight</p>
            <p>
              NOVA Business AI provides enterprise automation tools. Automated actions executed through
              connected third-party providers (CRM, ERP, Shopify) remain under your authorization and
              supervision.
            </p>
            <p className="font-semibold text-foreground">3. Data Ownership</p>
            <p>
              You retain all ownership rights to customer data, knowledge documents, and embeddings
              uploaded to your projects.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Privacy Policy Dialog ── */}
      <Dialog open={legalModal === "privacy"} onOpenChange={(open) => !open && setLegalModal(null)}>
        <DialogContent className="max-w-md bg-card text-foreground border-border">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Privacy Policy</DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Last updated: October 2026
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-xs text-muted-foreground max-h-[60vh] overflow-y-auto pr-2 leading-relaxed">
            <p>
              Your privacy and enterprise data security are our highest priority.
            </p>
            <p className="font-semibold text-foreground">1. Data Isolation</p>
            <p>
              Project knowledge, chat histories, and API credentials are kept strictly tenant-isolated
              using cryptographic tokens and row-level security.
            </p>
            <p className="font-semibold text-foreground">2. AI Model Training</p>
            <p>
              Customer data and queries processed through NOVA Business AI are never used to train public
              foundational AI models.
            </p>
            <p className="font-semibold text-foreground">3. Cookies & Tracking</p>
            <p>
              We use strictly necessary session tokens for authentication. Analytics are configured with
              cookieless tracking to respect user privacy.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
