import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "./pages/home";
import ChatPage from "./pages/chat";
import SettingsPage from "./pages/settings";
import ProfilePage from "./pages/profile";
import NotFound from "./pages/not-found";
import AdminProjectsPage from "./pages/admin-projects";
import AdminProjectEditPage from "./pages/admin-project-edit";
import SharedChatPage from "./pages/shared-chat";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { supabase } from "./lib/supabase";
import { useState } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";

const queryClient = new QueryClient();
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
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-lg border bg-card p-8 shadow-sm">
        <h2 className="mb-6 text-2xl font-bold text-foreground">
          {type === "login" ? "Welcome back" : "Create an account"}
        </h2>
        {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Email</label>
            <input
              type="email"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-foreground"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Password</label>
            <input
              type="password"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-foreground"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            {type === "login" ? "Sign In" : "Sign Up"}
          </button>
          
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border"></span>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>
          
          <button
            type="button"
            onClick={async () => {
              const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                  redirectTo: window.location.origin,
                },
              });
              if (error) setError(error.message);
            }}
            className="w-full flex justify-center items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-foreground hover:bg-muted transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
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
            Google
          </button>
        </form>
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
        <ThemeProvider defaultTheme="dark">
          <QueryClientProvider client={queryClient}>
          <TooltipProvider>
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
            <Toaster />
          </TooltipProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </AuthProvider>
    </WouterRouter>
  );
}
