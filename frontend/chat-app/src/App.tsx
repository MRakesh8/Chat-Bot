import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import React, { Suspense } from "react";
import Home from "./pages/home";
import ChatPage from "./pages/chat";
import SharedChatPage from "./pages/shared-chat";
import NotFound from "./pages/not-found";

const SettingsPage = React.lazy(() => import("./pages/settings"));
const ProfilePage = React.lazy(() => import("./pages/profile"));
const AdminProjectsPage = React.lazy(() => import("./pages/admin-projects"));
const AdminProjectEditPage = React.lazy(() => import("./pages/admin-project-edit"));

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { supabase } from "./lib/supabase";
import { useState } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 60 seconds
      gcTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Basic UI for Auth
function AuthPage({ type }: { type: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  if (user) {
    setLocation("/");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const { error } = type === "login" 
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    
    if (error) {
      if (error.message.includes("For security purposes")) {
        setError("Too many login attempts. Please wait a minute, or try Google Login instead.");
      } else {
        setError(error.message);
      }
    } else {
      setLocation("/");
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background relative px-4">
      <div className="z-10 w-full max-w-sm bg-[#111118] border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-xl">
        <h2 className="text-2xl font-semibold text-white mb-6">
          {type === "login" ? "Sign In" : "Sign Up"}
        </h2>
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-zinc-300 text-sm mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-black/50 border border-white/10 text-white rounded p-2 focus:ring-primary focus:border-primary" />
          </div>
          <div>
            <label className="block text-zinc-300 text-sm mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-black/50 border border-white/10 text-white rounded p-2 focus:ring-primary focus:border-primary" />
          </div>
          <button type="submit" className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white p-2 rounded mt-2">
            {type === "login" ? "Sign In" : "Sign Up"}
          </button>
        </form>

        <div className="my-6 flex items-center before:mt-0.5 before:flex-1 before:border-t before:border-white/10 after:mt-0.5 after:flex-1 after:border-t after:border-white/10">
          <p className="mx-4 mb-0 text-center text-sm text-zinc-500">or</p>
        </div>

        <button 
          onClick={async () => {
            const { error } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: window.location.origin }
            });
            if (error) setError(error.message);
          }}
          className="w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-200 p-2 rounded transition-colors font-medium"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className="mt-6 text-center text-zinc-400 text-sm">
          {type === "login" ? (
            <p>Don't have an account? <button onClick={() => setLocation("/sign-up")} className="text-primary">Sign up</button></p>
          ) : (
            <p>Already have an account? <button onClick={() => setLocation("/sign-in")} className="text-primary">Sign in</button></p>
          )}
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div>Loading...</div>;
  if (!user) return <Home />;
  
  return <>{children}</>;
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/sign-in"><AuthPage type="login" /></Route>
                <Route path="/sign-up"><AuthPage type="signup" /></Route>

                {/* Shared project chat */}
                <Route path="/p/:token" component={SharedChatPage} />

                <Route path="/admin/projects">
                  <ProtectedRoute><AdminProjectsPage /></ProtectedRoute>
                </Route>
                <Route path="/admin/projects/new">
                  <ProtectedRoute><AdminProjectEditPage /></ProtectedRoute>
                </Route>
                <Route path="/admin/projects/:id/edit">
                  <ProtectedRoute><AdminProjectEditPage /></ProtectedRoute>
                </Route>

                <Route path="/chat">
                  <ProtectedRoute><ChatPage /></ProtectedRoute>
                </Route>
                <Route path="/chat/:id">
                  <ProtectedRoute><ChatPage /></ProtectedRoute>
                </Route>
                <Route path="/settings">
                  <ProtectedRoute><SettingsPage /></ProtectedRoute>
                </Route>
                <Route path="/profile">
                  <ProtectedRoute><ProfilePage /></ProtectedRoute>
                </Route>
                <Route component={NotFound} />
              </Switch>
            </Suspense>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </WouterRouter>
  );
}
