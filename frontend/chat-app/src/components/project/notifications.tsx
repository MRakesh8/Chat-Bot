import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  Bell, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  RefreshCw, 
  Check, 
  CheckCheck, 
  Trash2, 
  Lightbulb, 
  ExternalLink, 
  SlidersHorizontal, 
  UserCheck, 
  Wrench, 
  ShieldAlert, 
  Filter,
  Search,
  Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuthFetch } from "@/hooks/use-auth-fetch";

export interface NotificationsProps {
  projectId: string;
  onSelectTab?: (tab: string) => void;
}

export type NotificationFilter = "all" | "unread" | "leads" | "tools" | "feedback" | "system";

export function Notifications({ projectId, onSelectTab }: NotificationsProps) {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Form state for settings dialog
  const [settingsForm, setSettingsForm] = useState({
    enabled: true,
    notifyOnDislikes: 3,
    notifyOnLikes: 3,
  });

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["project-notifications", projectId, activeFilter],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/notifications?filter=${activeFilter}`));
      if (!res.ok) throw new Error("Failed to load notifications");
      const json = await res.json();
      if (json.settings) {
        setSettingsForm({
          enabled: json.settings.enabled ?? true,
          notifyOnDislikes: json.settings.notifyOnDislikes ?? 3,
          notifyOnLikes: json.settings.notifyOnLikes ?? 3,
        });
      }
      return json as {
        notifications: any[];
        totalCount: number;
        unreadCount: number;
        settings: any;
      };
    },
    enabled: !!projectId,
    refetchInterval: 15000,
  });

  // Mark single notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/notifications/${notificationId}/read`), {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Failed to mark as read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-notifications", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-notifications-unread", projectId] });
      queryClient.invalidateQueries({ queryKey: ["top-nav-unread-summary"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Mark all notifications as read
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/notifications/read-all`), {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to mark all as read");
      return res.json();
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["project-notifications", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-notifications-unread", projectId] });
      queryClient.invalidateQueries({ queryKey: ["top-nav-unread-summary"] });
      toast({ title: "Success", description: `Marked ${res.markedCount || "all"} notifications as read.` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Delete single notification
  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/notifications/${notificationId}`), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete notification");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-notifications", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-notifications-unread", projectId] });
      queryClient.invalidateQueries({ queryKey: ["top-nav-unread-summary"] });
      toast({ title: "Deleted", description: "Notification removed." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Clear all read notifications
  const clearReadMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/notifications`), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to clear read notifications");
      return res.json();
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["project-notifications", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-notifications-unread", projectId] });
      queryClient.invalidateQueries({ queryKey: ["top-nav-unread-summary"] });
      toast({ title: "Cleared", description: `Removed ${res.clearedCount || 0} read notifications.` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (updatedSettings: typeof settingsForm) => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/notifications/settings`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSettings),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-notifications", projectId] });
      setSettingsOpen(false);
      toast({ title: "Settings Saved", description: "Notification preferences updated successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleNotificationClick = (notif: any) => {
    if (!notif.readAt) {
      markAsReadMutation.mutate(notif.id);
    }
    if (!onSelectTab) return;

    if (notif.type === "LEAD_CAPTURED" || notif.type === "lead") {
      onSelectTab("leads");
    } else if (notif.type === "SUGGESTION" || notif.type === "QUALITY_ALERT" || notif.type === "feedback") {
      onSelectTab("analytics");
    } else if (notif.type?.includes("TOOL") || notif.type === "SECURITY_ALERT" || notif.type === "tool_execution") {
      onSelectTab("services");
    }
  };

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount ?? notifications.filter((n: any) => !n.readAt).length;

  // Filter client-side for search query
  const filteredNotifications = useMemo(() => {
    if (!searchQuery.trim()) return notifications;
    const q = searchQuery.toLowerCase();
    return notifications.filter(
      (n: any) =>
        n.title?.toLowerCase().includes(q) ||
        n.message?.toLowerCase().includes(q) ||
        n.type?.toLowerCase().includes(q)
    );
  }, [notifications, searchQuery]);

  const getIconForNotification = (notif: any) => {
    const type = notif.type?.toUpperCase() || "";
    const severity = notif.severity?.toLowerCase() || "info";

    if (type === "LEAD_CAPTURED" || type === "LEAD") {
      return <UserCheck className="h-5 w-5 text-emerald-500" />;
    }
    if (type === "SUGGESTION") {
      return <Lightbulb className="h-5 w-5 text-amber-500" />;
    }
    if (type === "TOOL_FAILED" || severity === "error" || severity === "critical") {
      return <AlertCircle className="h-5 w-5 text-rose-500" />;
    }
    if (type === "SECURITY_ALERT" || severity === "warning" || severity === "high") {
      return <ShieldAlert className="h-5 w-5 text-amber-500" />;
    }
    if (type === "TOOL_SUCCESS" || severity === "success") {
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    }
    return <Info className="h-5 w-5 text-sky-500" />;
  };

  const getBadgeForType = (notif: any) => {
    const type = notif.type?.toUpperCase() || "";
    if (type === "LEAD_CAPTURED" || type === "LEAD") {
      return (
        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-medium">
          Lead Captured
        </Badge>
      );
    }
    if (type === "SUGGESTION") {
      return (
        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 font-medium">
          Suggestion
        </Badge>
      );
    }
    if (type === "QUALITY_ALERT") {
      return (
        <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-500 border-indigo-500/20 font-medium">
          Quality Alert
        </Badge>
      );
    }
    if (type === "TOOL_FAILED") {
      return (
        <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-500 border-rose-500/20 font-medium">
          Tool Failed
        </Badge>
      );
    }
    if (type === "SECURITY_ALERT") {
      return (
        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 font-medium">
          Security Alert
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-500 border-sky-500/20 font-medium">
        System
      </Badge>
    );
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/80 shadow-xs bg-card/90 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Bell className="h-4 w-4" />
                </div>
                Smart Notification Center
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="rounded-full px-2.5 py-0.5 text-xs font-semibold">
                    {unreadCount} unread
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                Real-time alerts for customer leads, tool execution events, feedback thresholds, and system health.
              </CardDescription>
            </div>

            {/* Top action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                  className="h-8 text-xs font-medium"
                >
                  {markAllReadMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <CheckCheck className="h-3.5 w-3.5 mr-1.5 text-primary" />
                  )}
                  Mark all as read
                </Button>
              )}

              {notifications.some((n: any) => n.readAt) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearReadMutation.mutate()}
                  disabled={clearReadMutation.isPending}
                  className="h-8 text-xs text-muted-foreground hover:text-destructive"
                  title="Clear all read notifications"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Clear read
                </Button>
              )}

              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs font-medium">
                    <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                    Preferences
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[480px]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-primary" />
                      Notification Preferences
                    </DialogTitle>
                    <DialogDescription>
                      Configure alert thresholds and automated triggers for this project.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-3">
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold">Enable Project Notifications</Label>
                        <p className="text-xs text-muted-foreground">
                          Receive alerts for leads, tool failures, and visitor feedback.
                        </p>
                      </div>
                      <Switch
                        checked={settingsForm.enabled}
                        onCheckedChange={(val) => setSettingsForm((prev) => ({ ...prev, enabled: val }))}
                      />
                    </div>

                    <div className="space-y-2 p-3 rounded-lg border bg-muted/10">
                      <Label htmlFor="notifyDislikes" className="text-xs font-semibold">
                        Negative Feedback Alert Threshold
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Trigger a quality alert when this many dislikes are received within 24 hours.
                      </p>
                      <Input
                        id="notifyDislikes"
                        type="number"
                        min="1"
                        max="50"
                        value={settingsForm.notifyOnDislikes}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            notifyOnDislikes: parseInt(e.target.value, 10) || 3,
                          }))
                        }
                        className="h-8 text-sm"
                      />
                    </div>

                    <div className="space-y-2 p-3 rounded-lg border bg-muted/10">
                      <Label htmlFor="notifyLikes" className="text-xs font-semibold">
                        Positive Feedback Milestone Threshold
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Trigger a milestone alert when this many likes are received within 24 hours.
                      </p>
                      <Input
                        id="notifyLikes"
                        type="number"
                        min="1"
                        max="50"
                        value={settingsForm.notifyOnLikes}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            notifyOnLikes: parseInt(e.target.value, 10) || 3,
                          }))
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => setSettingsOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => saveSettingsMutation.mutate(settingsForm)}
                      disabled={saveSettingsMutation.isPending}
                    >
                      {saveSettingsMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                      Save Preferences
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8 text-xs font-medium"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin text-primary" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Filter Bar & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-border/60">
            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "unread", label: "Unread" },
                  { id: "leads", label: "Leads" },
                  { id: "tools", label: "Tools & Security" },
                  { id: "feedback", label: "Feedback" },
                  { id: "system", label: "System" },
                ] as const
              ).map((tab) => (
                <Button
                  key={tab.id}
                  variant={activeFilter === tab.id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`h-7 px-3 text-xs font-medium rounded-full shrink-0 transition-all ${
                    activeFilter === tab.id
                      ? "bg-primary/15 text-primary font-semibold border border-primary/30"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {tab.id === "unread" && unreadCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.2 bg-primary/20 text-primary text-[10px] rounded-full font-bold">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              ))}
            </div>

            {/* Quick Search */}
            <div className="relative w-full sm:w-60 shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search alerts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs rounded-lg bg-background/60"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground text-sm font-medium">Loading verified notifications...</p>
            </div>
          ) : isError ? (
            <div className="text-center p-8 bg-destructive/5 rounded-xl border border-destructive/20 space-y-3">
              <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
              <p className="text-sm font-semibold text-destructive">Failed to load notifications</p>
              <p className="text-xs text-muted-foreground">Unable to reach the notification service. Please try again.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2 text-xs">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Retry
              </Button>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center p-10 bg-muted/20 rounded-xl border border-dashed border-border/80">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-3">
                <Bell className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                {searchQuery ? "No matching notifications" : "No notifications found"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                {searchQuery
                  ? `No alerts matched "${searchQuery}". Try a different search term.`
                  : activeFilter === "unread"
                  ? "You have zero unread notifications. All caught up!"
                  : "Genuine business events such as captured leads, visitor suggestions, and tool status updates will appear here."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notif: any) => {
                const isUnread = !notif.readAt;
                return (
                  <div
                    key={notif.id}
                    className={`group relative p-4 rounded-xl border transition-all duration-200 flex gap-4 ${
                      isUnread
                        ? "bg-primary/5 border-primary/25 hover:border-primary/50 shadow-2xs"
                        : "bg-card/50 border-border/60 hover:border-border text-muted-foreground hover:bg-muted/10"
                    }`}
                  >
                    {/* Left Icon */}
                    <div className="shrink-0 mt-0.5">
                      <div className={`p-2 rounded-lg ${isUnread ? "bg-background border shadow-2xs" : "bg-muted/40"}`}>
                        {getIconForNotification(notif)}
                      </div>
                    </div>

                    {/* Content */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer space-y-1"
                      onClick={() => handleNotificationClick(notif)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`text-sm font-semibold ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>
                            {notif.title}
                          </h4>
                          {getBadgeForType(notif)}
                          {isUnread && (
                            <span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" title="Unread" />
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0 font-mono">
                          {formatTimestamp(notif.createdAt)}
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {notif.message}
                      </p>

                      {/* Navigation Link Indicator */}
                      {onSelectTab && (
                        <div className="pt-1.5 flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                          <ExternalLink className="h-3 w-3" />
                          <span>
                            {notif.type === "LEAD_CAPTURED"
                              ? "View in Leads & CRM"
                              : notif.type === "SUGGESTION" || notif.type === "QUALITY_ALERT"
                              ? "View in Analytics & Feedback"
                              : "View details"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="shrink-0 flex items-center gap-1">
                      {isUnread && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsReadMutation.mutate(notif.id);
                          }}
                          disabled={markAsReadMutation.isPending}
                          title="Mark as read"
                          className="h-7 w-7 text-primary hover:bg-primary/10 hover:text-primary rounded-lg"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotificationMutation.mutate(notif.id);
                        }}
                        disabled={deleteNotificationMutation.isPending}
                        title="Delete notification"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg opacity-60 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
