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
import AdminClarityPage from "./pages/admin-clarity";
import ConnectedServicesPage from "./pages/connected-services";
import { DashboardLayout } from "./components/layout/dashboard-layout";
import { GlobalCommandMenu } from "./components/GlobalCommandMenu";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import AuthPage from "./pages/auth";

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
            <GlobalCommandMenu />
            <Toaster />
          </TooltipProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </AuthProvider>
    </WouterRouter>
  );
}
