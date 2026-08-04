import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { Loader2, MessageSquare, Database, Search, Bot } from "lucide-react";

const features = [
  { icon: MessageSquare, text: "AI Chat" },
  { icon: Database, text: "Project Knowledge" },
  { icon: Search, text: "Smart Search" },
  { icon: Bot, text: "Custom Assistants" },
];

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const { user, loginAsDemo } = useAuth();
  const [location, setLocation] = useLocation();

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
          redirectTo: window.location.origin,
        },
      });

      if (error) throw error;
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to authenticate");
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-[#0A0A0B] flex font-sans">
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

      <div className="relative z-10 flex w-full h-full lg:grid lg:grid-cols-2">
        
        {/* Left Side: Branding & Features (Hidden on mobile) */}
        <div className="hidden lg:flex flex-col justify-between p-12 xl:p-24 w-full h-[100dvh]">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col gap-6"
          >
            <div className="flex items-center gap-3 cursor-default group">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-[0_0_20px_rgba(99,102,241,0.4)] group-hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] transition-all"
              >
                <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`} alt="RAGHUB" className="w-7 h-7 brightness-0 invert" />
              </motion.div>
              <h1 className="text-2xl font-bold text-white tracking-tight">RAGHUB</h1>
            </div>

            <div className="mt-12 max-w-md">
              <h2 className="text-4xl xl:text-5xl font-bold text-white leading-tight tracking-tight mb-6">
                Your Intelligent <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Workspace</span>
              </h2>
              <p className="text-lg text-slate-300 leading-relaxed mb-10">
                Build knowledge bases, chat with AI, manage projects, and create custom assistants in one seamless platform.
              </p>

              <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                {features.map((feature, idx) => (
                  <motion.div 
                    key={feature.text}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 + idx * 0.1 }}
                    className="flex items-center gap-3 text-slate-200 font-medium"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10">
                      <feature.icon className="w-4 h-4 text-indigo-300" />
                    </div>
                    {feature.text}
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* AI Orb Visual */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="relative w-64 h-64 mt-auto mx-auto lg:mx-0 flex items-center justify-center"
          >
            {/* Core */}
            <motion.div 
              animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute w-24 h-24 rounded-full bg-white blur-md z-20 mix-blend-overlay"
            />
            {/* Inner Glow */}
            <motion.div 
              animate={{ scale: [1, 1.1, 1], rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute w-32 h-32 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-400 blur-xl z-10 opacity-80"
            />
            {/* Outer Aura */}
            <motion.div 
              animate={{ scale: [1, 1.2, 1], rotate: -360 }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              className="absolute w-48 h-48 rounded-full bg-gradient-to-bl from-blue-600 to-purple-600 blur-2xl z-0 opacity-50"
            />
            {/* Particles */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  y: [0, -30, 0],
                  x: [0, (i % 2 === 0 ? 20 : -20), 0],
                  opacity: [0, 0.8, 0],
                  scale: [0.5, 1.5, 0.5]
                }}
                transition={{
                  duration: 3 + i,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.5
                }}
                className="absolute w-1.5 h-1.5 bg-white rounded-full blur-[1px] z-30"
                style={{
                  top: `${40 + Math.random() * 20}%`,
                  left: `${40 + Math.random() * 20}%`
                }}
              />
            ))}
          </motion.div>
        </div>

        {/* Right Side: Login Card */}
        <div className="flex items-center justify-center w-full h-[100dvh] p-6">
          <AnimatePresence mode="wait">
            {!isSuccess ? (
              <motion.div 
                key="login-form"
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                whileHover={{ y: -2 }}
                className="relative w-full max-w-[420px] rounded-[24px] p-8 sm:p-10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] border border-white/10"
                style={{
                  background: "rgba(15, 15, 20, 0.65)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)"
                }}
              >
                {/* Mobile branding */}
                <div className="lg:hidden flex flex-col items-center mb-8">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-[0_0_20px_rgba(99,102,241,0.4)] mb-4">
                    <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`} alt="RAGHUB" className="w-7 h-7 brightness-0 invert" />
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">RAGHUB</h2>
                  <p className="text-sm text-slate-400 mt-1">Your Intelligent Workspace</p>
                </div>

                <div className="text-center lg:text-left mb-8">
                  <h3 className="text-2xl font-semibold text-white tracking-tight mb-2">Welcome Back</h3>
                  <p className="text-slate-400 text-sm">Sign in to continue to your workspace.</p>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs leading-relaxed text-left"
                  >
                    <p className="font-semibold text-red-400 mb-1">Connection Issue Detected</p>
                    {error}
                  </motion.div>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="relative group w-full h-[56px] flex items-center justify-center gap-3 bg-white text-[#0A0A0B] rounded-xl font-semibold text-[15px] transition-all disabled:opacity-70 disabled:cursor-not-allowed overflow-hidden"
                  aria-label="Continue with Google"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-100 to-purple-100 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  {isLoading ? (
                    <span className="relative z-10 flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Authenticating...
                    </span>
                  ) : (
                    <span className="relative z-10 flex items-center gap-3">
                      <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                        <path d="M12.0003 4.75C13.7703 4.75 15.3553 5.36002 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.28027 6.60998L5.27028 9.70498C6.21525 6.86002 8.87028 4.75 12.0003 4.75Z" fill="#EA4335" />
                        <path d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z" fill="#4285F4" />
                        <path d="M5.26498 14.2949C5.02498 13.5699 4.88501 12.7999 4.88501 11.9999C4.88501 11.1999 5.01998 10.4299 5.26498 9.7049L1.275 6.60986C0.46 8.22986 0 10.0599 0 11.9999C0 13.9399 0.46 15.7699 1.28 17.3899L5.26498 14.2949Z" fill="#FBBC05" />
                        <path d="M12.0004 24.0001C15.2404 24.0001 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.8704 19.245 6.21537 17.135 5.26538 14.29L1.27539 17.385C3.25539 21.31 7.3104 24.0001 12.0004 24.0001Z" fill="#34A853" />
                      </svg>
                      Continue with Google
                    </span>
                  )}
                </motion.button>

                <div className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      loginAsDemo();
                      setLocation("/chat");
                    }}
                    className="w-full py-3 px-4 text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
                  >
                    Continue as Demo User / Guest
                  </button>
                </div>
                
                <p className="mt-6 text-center text-xs text-slate-500 leading-relaxed">
                  By continuing, you agree to RAGHUB's <br className="hidden sm:block"/>
                  <a href="#" className="text-slate-400 hover:text-white transition-colors underline decoration-slate-600 underline-offset-2">Terms of Service</a> and <a href="#" className="text-slate-400 hover:text-white transition-colors underline decoration-slate-600 underline-offset-2">Privacy Policy</a>.
                </p>
              </motion.div>
            ) : (
              <motion.div 
                key="success-message"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center text-center"
              >
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
                  <div className="w-8 h-8 rounded-full border-t-2 border-r-2 border-green-400 animate-spin" />
                </div>
                <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Welcome Back</h2>
                <p className="text-slate-400">Taking you to your workspace...</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
