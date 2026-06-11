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
