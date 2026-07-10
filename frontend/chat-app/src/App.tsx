import { Suspense, lazy } from "react";
import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { DashboardLayout } from "./components/layout/dashboard-layout";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";

// Critical paths loaded synchronously
import Home from "./pages/home";

// Lazy-loaded heavy components and layouts
const GlobalCommandMenu = lazy(() => import("./components/GlobalCommandMenu").then(m => ({ default: m.GlobalCommandMenu })));
const DashboardLayoutLazy = lazy(() => import("./components/layout/dashboard-layout").then(m => ({ default: m.DashboardLayout })));

// Lazy-loaded routes for performance
const AuthPage = lazy(() => import("./pages/auth"));
const NotFound = lazy(() => import("./pages/not-found"));
const ChatPage = lazy(() => import("./pages/chat"));
const SettingsPage = lazy(() => import("./pages/settings"));
const ProfilePage = lazy(() => import("./pages/profile"));
const AdminProjectsPage = lazy(() => import("./pages/admin-projects"));
const AdminProjectEditPage = lazy(() => import("./pages/admin-project-edit"));
const SharedChatPage = lazy(() => import("./pages/shared-chat"));
const AdminClarityPage = lazy(() => import("./pages/admin-clarity"));
const ConnectedServicesPage = lazy(() => import("./pages/connected-services"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 15000),
      staleTime: 1000 * 60 * 2, // 2 minutes
      refetchOnWindowFocus: false,
    },
  },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div>Loading...</div>;
  if (!user) return <Home />;
  
  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, dbUser, isLoading } = useAuth();
  
  if (isLoading) return <div>Loading...</div>;
  if (!user || !dbUser || dbUser.role !== "super_admin") return <Home />;
  
  return <>{children}</>;
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider defaultTheme="dark">
            <TooltipProvider>
              <Suspense fallback={<div className="flex items-center justify-center h-screen w-screen text-muted-foreground">Loading...</div>}>
                <Switch>
                  <Route path="/" component={Home} />
                  <Route path="/sign-in"><AuthPage /></Route>
                  <Route path="/sign-up"><AuthPage /></Route>

                  {/* Shared project chat */}
                  <Route path="/p/:token" component={SharedChatPage} />

                  <Route path="/admin/projects">
                    <ProtectedRoute><DashboardLayoutLazy><AdminProjectsPage /></DashboardLayoutLazy></ProtectedRoute>
                  </Route>
                  <Route path="/admin/projects/new">
                    <ProtectedRoute><DashboardLayoutLazy><AdminProjectEditPage /></DashboardLayoutLazy></ProtectedRoute>
                  </Route>
                  <Route path="/admin/projects/:id/edit">
                    <ProtectedRoute><DashboardLayoutLazy><AdminProjectEditPage /></DashboardLayoutLazy></ProtectedRoute>
                  </Route>

                  <Route path="/chat/:id?">
                    <ProtectedRoute><DashboardLayoutLazy><ChatPage /></DashboardLayoutLazy></ProtectedRoute>
                  </Route>
                  <Route path="/settings">
                    <ProtectedRoute><DashboardLayoutLazy><SettingsPage /></DashboardLayoutLazy></ProtectedRoute>
                  </Route>
                  <Route path="/profile">
                    <ProtectedRoute><DashboardLayoutLazy><ProfilePage /></DashboardLayoutLazy></ProtectedRoute>
                  </Route>
                  <Route path="/services">
                    <ProtectedRoute><DashboardLayoutLazy><ConnectedServicesPage /></DashboardLayoutLazy></ProtectedRoute>
                  </Route>
                  <Route path="/admin/clarity">
                    <ProtectedRoute><DashboardLayoutLazy><AdminClarityPage /></DashboardLayoutLazy></ProtectedRoute>
                  </Route>
                  <Route component={NotFound} />
                </Switch>
              </Suspense>
              <GlobalCommandMenu />
              <Toaster />
            </TooltipProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WouterRouter>
  );
}
