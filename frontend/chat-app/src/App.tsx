import { Suspense, lazy } from "react";
import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { DashboardLayout } from "./components/layout/dashboard-layout";
import { GlobalCommandMenu } from "./components/GlobalCommandMenu";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";

// Critical paths loaded synchronously
import Home from "./pages/home";
import AuthPage from "./pages/auth";
import NotFound from "./pages/not-found";

// Lazy-loaded routes for performance
const ChatPage = lazy(() => import("./pages/chat"));
const SettingsPage = lazy(() => import("./pages/settings"));
const ProfilePage = lazy(() => import("./pages/profile"));
const AdminProjectsPage = lazy(() => import("./pages/admin-projects"));
const AdminProjectEditPage = lazy(() => import("./pages/admin-project-edit"));
const SharedChatPage = lazy(() => import("./pages/shared-chat"));
const AdminClarityPage = lazy(() => import("./pages/admin-clarity"));
const ConnectedServicesPage = lazy(() => import("./pages/connected-services"));

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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
            <Suspense fallback={<div className="flex items-center justify-center h-screen w-screen text-muted-foreground">Loading...</div>}>
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/sign-in"><AuthPage /></Route>
                <Route path="/sign-up"><AuthPage /></Route>

                {/* Shared project chat */}
                <Route path="/p/:token" component={SharedChatPage} />

                <Route path="/admin/projects">
                  <ProtectedRoute><DashboardLayout><AdminProjectsPage /></DashboardLayout></ProtectedRoute>
                </Route>
                <Route path="/admin/projects/new">
                  <ProtectedRoute><DashboardLayout><AdminProjectEditPage /></DashboardLayout></ProtectedRoute>
                </Route>
                <Route path="/admin/projects/:id/edit">
                  <ProtectedRoute><DashboardLayout><AdminProjectEditPage /></DashboardLayout></ProtectedRoute>
                </Route>

                <Route path="/chat">
                  <ProtectedRoute><DashboardLayout><ChatPage /></DashboardLayout></ProtectedRoute>
                </Route>
                <Route path="/chat/:id">
                  <ProtectedRoute><DashboardLayout><ChatPage /></DashboardLayout></ProtectedRoute>
                </Route>
                <Route path="/settings">
                  <ProtectedRoute><DashboardLayout><SettingsPage /></DashboardLayout></ProtectedRoute>
                </Route>
                <Route path="/profile">
                  <ProtectedRoute><DashboardLayout><ProfilePage /></DashboardLayout></ProtectedRoute>
                </Route>
                <Route path="/services">
                  <ProtectedRoute><DashboardLayout><ConnectedServicesPage /></DashboardLayout></ProtectedRoute>
                </Route>
                <Route path="/admin/clarity">
                  <ProtectedRoute><DashboardLayout><AdminClarityPage /></DashboardLayout></ProtectedRoute>
                </Route>
                <Route component={NotFound} />
              </Switch>
            </Suspense>
            <GlobalCommandMenu />
            <Toaster />
          </TooltipProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </AuthProvider>
    </WouterRouter>
  );
}
