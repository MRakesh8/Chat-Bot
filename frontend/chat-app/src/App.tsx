import { Suspense, lazy, useEffect } from "react";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalLoadingScreen } from "@/components/ui/global-loading";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { NovaAiProvider } from "./contexts/NovaAiContext";

import { lazyWithRetry } from "./lib/lazy-with-retry";
import { AppErrorBoundary, RouteErrorBoundary } from "./components/route-error-boundary";
import { WorkspaceLoadingFallback } from "./components/layout/workspace-loading";

// Critical paths loaded synchronously
import Home from "./pages/home";

// Lazy-loaded heavy components and layouts with retry and version recovery
const GlobalCommandMenu = lazyWithRetry(() => import("./components/GlobalCommandMenu").then(m => ({ default: m.GlobalCommandMenu })), { key: "command-menu" });
const DashboardLayoutLazy = lazyWithRetry(() => import("./components/layout/dashboard-layout").then(m => ({ default: m.DashboardLayout })), { key: "dashboard-layout" });

// Lazy-loaded routes for performance with retry and version recovery
const AuthPage = lazyWithRetry(() => import("./pages/auth"), { key: "auth" });
const NotFound = lazyWithRetry(() => import("./pages/not-found"), { key: "not-found" });
const ChatPage = lazyWithRetry(() => import("./pages/chat"), { key: "chat" });
const SettingsPage = lazyWithRetry(() => import("./pages/settings"), { key: "settings" });
const NotificationsPage = lazyWithRetry(() => import("./pages/notifications"), { key: "notifications" });
const ProfilePage = lazyWithRetry(() => import("./pages/profile"), { key: "profile" });
const BillingPage = lazyWithRetry(() => import("./pages/billing"), { key: "billing" });
const ProjectsPage = lazyWithRetry(() => import("./pages/projects"), { key: "projects" });
const ProjectEditPage = lazyWithRetry(() => import("./pages/project-edit"), { key: "project-edit" });
const SharedChatPage = lazyWithRetry(() => import("./pages/shared-chat"), { key: "shared-chat" });
const AdminClarityPage = lazyWithRetry(() => import("./pages/admin-clarity"), { key: "admin-clarity" });
const ConnectedServicesPage = lazyWithRetry(() => import("./pages/connected-services"), { key: "connected-services" });
const ApiCenterPage = lazyWithRetry(() => import("./pages/api-center"), { key: "api-center" });
const AgentControlPage = lazyWithRetry(() => import("./pages/agent-control"), { key: "agent-control" });
const ProjectWorkingPage = lazyWithRetry(() => import("./pages/project-working"), { key: "project-working" });

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

function ForbiddenPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground relative overflow-hidden px-6 py-12">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-500/15 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-md w-full text-center space-y-6 relative z-10 bg-card/60 backdrop-blur-xl border border-foreground/10 p-8 md:p-10 rounded-3xl shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-400">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m0 -10.0A9 9 0 1012 21a9 9 0 000-18zm-9 9a9 9 0 0018 0" />
          </svg>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-widest text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
            403 — Access Denied
          </span>
          <h1 className="text-3xl font-bold text-foreground tracking-tight pt-2">
            Restricted Area
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
            You do not have permission to access platform administration pages.
          </p>
        </div>

        <div className="pt-4 border-t border-foreground/5">
          <button
            onClick={() => setLocation("/projects")}
            className="w-full sm:w-auto px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium text-sm transition-all"
          >
            Return to Projects
          </button>
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <GlobalLoadingScreen />;
  if (!user) return <Home />;
  
  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, dbUser, isLoading } = useAuth();
  
  if (isLoading) return <GlobalLoadingScreen />;
  if (!user) return <Home />;
  if (!dbUser || dbUser.role !== "super_admin") return <ForbiddenPage />;
  
  return <>{children}</>;
}

function NavigationListener() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const handleNav = (e: Event) => {
      const customEvent = e as CustomEvent<{ route: string }>;
      if (customEvent.detail?.route) {
        setLocation(customEvent.detail.route);
      }
    };
    window.addEventListener("nova:navigate", handleNav);
    return () => window.removeEventListener("nova:navigate", handleNav);
  }, [setLocation]);

  return null;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <WouterRouter base={basePath}>
        <NavigationListener />
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ThemeProvider defaultPalette="nova-natural" defaultMode="dark">
              <NovaAiProvider>
                <TooltipProvider>
                  <Suspense fallback={<GlobalLoadingScreen />}>
                    <Switch>
                      <Route path="/" component={Home} />
                      <Route path="/sign-in"><AuthPage /></Route>
                      <Route path="/sign-up"><AuthPage /></Route>

                      {/* Shared public project chat */}
                      <Route path="/p/:token" component={SharedChatPage} />

                      {/* Persistent Workspace Shell for all protected workspace routes */}
                      <Route>
                        <ProtectedRoute>
                          <DashboardLayoutLazy>
                            <RouteErrorBoundary>
                              <Suspense fallback={<WorkspaceLoadingFallback />}>
                                <Switch>
                                  <Route path="/projects" component={ProjectsPage} />
                                  <Route path="/projects/new" component={ProjectEditPage} />
                                  <Route path="/projects/:id/edit" component={ProjectEditPage} />

                                  {/* Project Working routes */}
                                  <Route path="/projects/working" component={ProjectWorkingPage} />
                                  <Route path="/projects/:id/working" component={ProjectWorkingPage} />
                                  <Route path="/projects/guide">
                                    <Redirect to="/projects/working" replace />
                                  </Route>
                                  <Route path="/projects/:id/guide">
                                    {(params) => <Redirect to={`/projects/${params.id}/working`} replace />}
                                  </Route>

                                  {/* Demo and Explore routes */}
                                  <Route path="/projects/demo">
                                    <Redirect to="/projects/00000000-0000-4000-8000-000000000000/edit" replace />
                                  </Route>
                                  <Route path="/projects/explore">
                                    <Redirect to="/projects/00000000-0000-4000-8000-000000000000/edit" replace />
                                  </Route>

                                  {/* Legacy /admin/projects redirects */}
                                  <Route path="/admin/projects">
                                    <Redirect to="/projects" replace />
                                  </Route>
                                  <Route path="/admin/projects/new">
                                    <Redirect to="/projects/new" replace />
                                  </Route>
                                  <Route path="/admin/projects/:id/edit">
                                    {(params) => <Redirect to={`/projects/${params.id}/edit`} replace />}
                                  </Route>

                                  <Route path="/chat/:id?" component={ChatPage} />
                                  <Route path="/notifications" component={NotificationsPage} />
                                  <Route path="/settings" component={SettingsPage} />
                                  <Route path="/profile" component={ProfilePage} />
                                  <Route path="/billing" component={BillingPage} />
                                  <Route path="/services" component={ConnectedServicesPage} />
                                  <Route path="/api-center" component={ApiCenterPage} />
                                  <Route path="/agent-control" component={AgentControlPage} />
                                  <Route path="/agent-control/:projectId" component={AgentControlPage} />

                                  {/* Platform Super Admin Administration */}
                                  <Route path="/admin">
                                    <Redirect to="/admin/clarity" replace />
                                  </Route>
                                  <Route path="/admin/clarity">
                                    <SuperAdminRoute><AdminClarityPage /></SuperAdminRoute>
                                  </Route>

                                  <Route component={NotFound} />
                                </Switch>
                              </Suspense>
                            </RouteErrorBoundary>
                          </DashboardLayoutLazy>
                        </ProtectedRoute>
                      </Route>
                    </Switch>
                  </Suspense>
                  <Suspense fallback={null}>
                    <GlobalCommandMenu />
                  </Suspense>
                  <Toaster />
                </TooltipProvider>
              </NovaAiProvider>
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </WouterRouter>
    </AppErrorBoundary>
  );
}
