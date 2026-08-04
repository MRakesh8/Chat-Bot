import { useAuth } from "../contexts/AuthContext";
import { Link, Redirect, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, BrainCircuit, Zap, Lock, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

import { useSEO } from "@/hooks/use-seo";

export default function Home() {
  useSEO({
    title: "Rakesh AI Chatbot - Multi Provider AI Assistant",
    description: "AI-powered chatbot supporting multiple AI providers, customer support, intelligent conversations, and business automation.",
    keywords: "AI chatbot, customer support chatbot, Gemini AI, OpenAI chatbot, AI assistant, Rakesh chatbot",
    canonicalPath: ""
  });

  const { user, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { toast } = useToast();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleGoogleAuth = async () => {
    try {
      setIsAuthenticating(true);

      // IMPORTANT: Always use the direct supabase client (never the proxy) for OAuth.
      // PKCE requires the same client instance to initiate and complete the flow.
      // The proxy client stores the code_verifier under a different storage key,
      // causing 400/422 errors on /auth/v1/token?grant_type=pkce.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${basePath}/chat`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      setIsAuthenticating(false);
      toast({
        title: "Authentication failed",
        description: error.message || "Please check network or Supabase connection.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      {user && <Redirect to="/chat" />}
      <div className="min-h-screen bg-background flex flex-col relative overflow-hidden text-foreground">
        {/* Animated Gradient Background */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
              x: [0, 100, 0],
              y: [0, -50, 0],
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute -top-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-purple-600/20 blur-[120px]"
          />
          <motion.div
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.2, 0.4, 0.2],
              x: [0, -100, 0],
              y: [0, 100, 0],
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute top-[20%] right-[0%] w-[40vw] h-[40vw] rounded-full bg-indigo-600/20 blur-[100px]"
          />
          <motion.div
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.3, 0.6, 0.3],
              x: [0, 50, 0],
              y: [0, 50, 0],
            }}
            transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-[-10%] left-[20%] w-[60vw] h-[60vw] rounded-full bg-blue-600/20 blur-[150px]"
          />
          {/* Subtle noise overlay */}
          <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
        </div>

        {/* Navigation */}
        <header className="px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <img src={`${basePath}/logo.svg`} alt="RAGHUB" className="w-8 h-8" />
            <span className="font-bold text-xl tracking-tight text-foreground">RAGHUB</span>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setLocation("/chat")}
                >
                  Chat
                </Button>
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => signOut()}
                >
                  Sign Out
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                className="bg-background/50 backdrop-blur-sm border-white/10 hover:bg-white/10"
                onClick={handleGoogleAuth}
                disabled={isAuthenticating}
              >
                {isAuthenticating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 mr-2" aria-hidden="true">
                    <path d="M12.0003 4.75C13.7703 4.75 15.3553 5.36002 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.28027 6.60998L5.27028 9.70498C6.21525 6.86002 8.87028 4.75 12.0003 4.75Z" fill="#EA4335" />
                    <path d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z" fill="#4285F4" />
                    <path d="M5.26498 14.2949C5.02498 13.5699 4.88501 12.7999 4.88501 11.9999C4.88501 11.1999 5.01998 10.4299 5.26498 9.7049L1.275 6.60986C0.46 8.22986 0 10.0599 0 11.9999C0 13.9399 0.46 15.7699 1.28 17.3899L5.26498 14.2949Z" fill="#FBBC05" />
                    <path d="M12.0004 24.0001C15.2404 24.0001 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.8704 19.245 6.21537 17.135 5.26538 14.29L1.27539 17.385C3.25539 21.31 7.3104 24.0001 12.0004 24.0001Z" fill="#34A853" />
                  </svg>
                )}
                Continue with Google
              </Button>
            )}
          </div>
        </header>

        {/* Hero Section */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center z-10 mt-12 mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card border border-border mb-8"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Introducing RAGHUB 3.0</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tighter text-foreground max-w-4xl leading-[1.1]"
          >
            Intelligence that feels <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">alive.</span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl"
          >
            Your personal AI companion. Powerful enough for complex coding, casual enough for daily chats. Experience the next evolution of conversation.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center gap-4"
          >
            {!user ? (
              <Button 
                onClick={handleGoogleAuth}
                disabled={isAuthenticating}
                size="lg" 
                className="w-full sm:w-auto text-lg h-14 px-8 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0 shadow-[0_0_30px_-5px_rgba(124,58,237,0.4)]"
              >
                {isAuthenticating ? (
                  <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                ) : (
                  <svg viewBox="0 0 24 24" className="w-5 h-5 mr-3 bg-white rounded-full p-0.5" aria-hidden="true">
                    <path d="M12.0003 4.75C13.7703 4.75 15.3553 5.36002 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.28027 6.60998L5.27028 9.70498C6.21525 6.86002 8.87028 4.75 12.0003 4.75Z" fill="#EA4335" />
                    <path d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z" fill="#4285F4" />
                    <path d="M5.26498 14.2949C5.02498 13.5699 4.88501 12.7999 4.88501 11.9999C4.88501 11.1999 5.01998 10.4299 5.26498 9.7049L1.275 6.60986C0.46 8.22986 0 10.0599 0 11.9999C0 13.9399 0.46 15.7699 1.28 17.3899L5.26498 14.2949Z" fill="#FBBC05" />
                    <path d="M12.0004 24.0001C15.2404 24.0001 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.8704 19.245 6.21537 17.135 5.26538 14.29L1.27539 17.385C3.25539 21.31 7.3104 24.0001 12.0004 24.0001Z" fill="#34A853" />
                  </svg>
                )}
                Continue with Google
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            ) : (
              <Button 
                onClick={() => setLocation("/chat")}
                size="lg" 
                className="w-full sm:w-auto text-lg h-14 px-8 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0 shadow-[0_0_30px_-5px_rgba(124,58,237,0.4)]"
              >
                Go to Workspace
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            )}
          </motion.div>
        </main>

        {/* Features Grid */}
        <section className="px-6 py-24 bg-muted/40 border-t border-border z-10">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="p-6 rounded-2xl bg-card/40 border border-white/5 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:bg-card/60 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-violet-500/20 flex items-center justify-center mb-6">
                  <BrainCircuit className="w-6 h-6 text-violet-400" />
                </div>
                <h3 className="text-xl font-semibold text-card-foreground mb-3">Advanced Reasoning</h3>
                <p className="text-muted-foreground">Powered by the latest models for deep analysis, coding, and creative problem-solving.</p>
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="p-6 rounded-2xl bg-card/40 border border-white/5 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:bg-card/60 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-indigo-500/20 flex items-center justify-center mb-6">
                  <Zap className="w-6 h-6 text-indigo-400" />
                </div>
                <h3 className="text-xl font-semibold text-card-foreground mb-3">Lightning Fast</h3>
                <p className="text-muted-foreground">Real-time streaming responses and an optimized interface that never keeps you waiting.</p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="p-6 rounded-2xl bg-card/40 border border-white/5 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:bg-card/60 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center mb-6">
                  <Lock className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-xl font-semibold text-card-foreground mb-3">Private & Secure</h3>
                <p className="text-muted-foreground">Your conversations are yours. Enterprise-grade security keeps your data protected.</p>
              </motion.div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
