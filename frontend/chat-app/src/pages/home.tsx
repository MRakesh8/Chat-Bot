import { useAuth } from "../contexts/AuthContext";
import { Link, Redirect, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, BrainCircuit, Zap, Lock, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function Home() {
  const { user, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { toast } = useToast();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleGoogleAuth = async () => {
    try {
      setIsAuthenticating(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${basePath}/chat`,
        },
      });
      if (error) throw error;
    } catch (error) {
      setIsAuthenticating(false);
      toast({
        title: "Authentication failed",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      {user && <Redirect to="/chat" />}
      <div className="min-h-[100dvh] bg-background flex flex-col relative overflow-hidden text-foreground selection:bg-primary/20 selection:text-primary">
        {/* Subtle dot grid background */}
        <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        
        {/* Soft radial gradient for depth */}
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary/5 opacity-50 blur-[100px]" />

        {/* Navigation */}
        {/* Navigation */}
        <header className="px-6 py-5 flex items-center justify-between z-10 max-w-6xl w-full mx-auto">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-1.5 rounded-full">
              <img src={`${basePath}/logo.svg`} alt="Script" className="w-4 h-4 invert" />
            </div>
            <span className="font-bold text-xl tracking-tight text-foreground">Script</span>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground font-medium rounded-full"
                  onClick={() => setLocation("/chat")}
                >
                  Chat
                </Button>
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground font-medium rounded-full"
                  onClick={() => signOut()}
                >
                  Sign Out
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                className="bg-white hover:bg-gray-50 border-gray-200 text-gray-700 font-medium rounded-full shadow-sm"
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
                Log in
              </Button>
            )}
          </div>
        </header>

        {/* Hero Section */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center z-10 pt-20 pb-28">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-gray-200 shadow-sm mb-10"
          >
            <Sparkles className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-700 tracking-wide">Meet the new Script</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
            className="text-6xl md:text-[5.5rem] font-bold tracking-tight text-primary max-w-4xl leading-[1.05]"
          >
            The smart assistant for your best work.
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            className="mt-8 text-xl md:text-2xl text-muted-foreground max-w-2xl font-medium"
          >
            Streamline tasks, write copy, generate images, and code effortlessly. Your ultimate workspace companion is here.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            className="mt-12 flex flex-col sm:flex-row items-center gap-4"
          >
            {!user ? (
              <Button 
                onClick={handleGoogleAuth}
                disabled={isAuthenticating}
                size="lg" 
                className="w-full sm:w-auto text-lg h-14 px-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-transform hover:scale-105 active:scale-95"
              >
                {isAuthenticating ? (
                  <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                ) : null}
                Get Started for Free
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            ) : (
              <Button 
                onClick={() => setLocation("/chat")}
                size="lg" 
                className="w-full sm:w-auto text-lg h-14 px-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-transform hover:scale-105 active:scale-95"
              >
                Go to Workspace
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            )}
          </motion.div>
        </main>

        {/* Features Grid */}
        <section className="px-6 py-28 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-6">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="p-8 rounded-3xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center mb-6">
                  <BrainCircuit className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Intelligent Writing</h3>
                <p className="text-gray-600 leading-relaxed">Instantly generate high-converting copy, essays, and reports with deep contextual awareness.</p>
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="p-8 rounded-3xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-6">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Lightning Fast</h3>
                <p className="text-gray-600 leading-relaxed">Experience zero-latency streaming responses that keep up with your fastest workflows.</p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="p-8 rounded-3xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center mb-6">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Enterprise Secure</h3>
                <p className="text-gray-600 leading-relaxed">Your data is strictly yours. Enjoy peace of mind with enterprise-grade privacy and security.</p>
              </motion.div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
