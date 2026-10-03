import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bell, CheckCircle, AlertCircle, Info, RefreshCw, Check, Lightbulb, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Notifications({ projectId, onSelectTab }: { projectId: string; onSelectTab?: (tab: string) => void }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = session?.access_token;
    return fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["project-notifications", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/notifications`));
      if (!res.ok) throw new Error("Failed to load notifications");
      return await res.json() as { notifications: any[], settings: any };
    },
    enabled: !!projectId,
    refetchInterval: 30000,
  });

  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/notifications/${notificationId}/read`), {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Failed to mark as read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-notifications", projectId] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleNotificationClick = (notif: any) => {
    if (!notif.readAt) {
      markAsRead.mutate(notif.id);
    }
    if ((notif.type === "SUGGESTION" || notif.type === "QUALITY_ALERT") && onSelectTab) {
      onSelectTab("analytics");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary/50 mb-4" />
          <p className="text-muted-foreground text-sm font-medium">Loading notifications...</p>
        </CardContent>
      </Card>
    );
  }

  const notifications = data?.notifications || [];
  const unreadCount = notifications.filter((n: any) => !n.readAt).length;

  const getIconForNotification = (notif: any) => {
    if (notif.type === "SUGGESTION") {
      return <Lightbulb className="h-5 w-5 text-amber-500" />;
    }
    const severity = notif.severity || "info";
    switch (severity.toLowerCase()) {
      case "error":
      case "critical":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case "warning":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Alerts & Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2 rounded-full px-2 py-0.5 text-xs">
                {unreadCount} new
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            System alerts, feedback thresholds, and visitor suggestions for this project.
          </CardDescription>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => queryClient.invalidateQueries({ queryKey: ["project-notifications", projectId] })}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <div className="text-center p-8 bg-muted/20 rounded-xl border border-dashed">
            <Bell className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No notifications yet.</p>
            <p className="text-xs text-muted-foreground mt-1">When visitor suggestions or system events occur, you will see alerts here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map((notif: any) => (
              <div 
                key={notif.id} 
                className={`p-4 rounded-xl border flex gap-4 transition-all ${
                  !notif.readAt ? 'bg-primary/5 border-primary/20 hover:border-primary/40' : 'bg-background border-border/50 opacity-80'
                }`}
              >
                <div className="shrink-0 mt-1">
                  {getIconForNotification(notif)}
                </div>
                <div 
                  className="flex-1 space-y-1 cursor-pointer"
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className={`text-sm font-semibold ${!notif.readAt ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {notif.title}
                      </h4>
                      {notif.type === "SUGGESTION" && (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">
                          Suggestion
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-4">
                      {new Date(notif.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{notif.message}</p>
                  {(notif.type === "SUGGESTION" || notif.type === "QUALITY_ALERT") && onSelectTab && (
                    <p className="text-xs text-primary font-medium flex items-center gap-1 pt-1">
                      <ExternalLink className="w-3 h-3" /> View in Analytics & Feedback
                    </p>
                  )}
                </div>
                <div className="shrink-0 flex items-center justify-center pl-2">
                  {!notif.readAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markAsRead.mutate(notif.id)}
                      disabled={markAsRead.isPending}
                      title="Mark as read"
                      className="h-8 px-2 text-primary hover:bg-primary/10 hover:text-primary"
                    >
                      {markAsRead.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
