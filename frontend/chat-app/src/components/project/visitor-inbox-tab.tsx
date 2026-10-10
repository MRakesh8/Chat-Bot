import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { apiUrl } from "@/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox,
  MessageSquare,
  Bot,
  User,
  Search,
  Sparkles,
  Clock,
  ArrowLeft,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Database
} from "lucide-react";

export type VisitorConversation = {
  id: string;
  title: string;
  userId: string | null;
  customerId: string | null;
  projectId: string;
  createdAt: string;
  updatedAt?: string;
  messageCount?: number;
  lastMessage?: string | null;
  lastMessageRole?: "user" | "assistant" | null;
};

export type VisitorMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sourceTransparency?: string | null;
  confidence?: string | null;
  fileIds?: string[] | null;
};

export type VisitorConversationDetail = VisitorConversation & {
  messages: VisitorMessage[];
};

interface VisitorInboxTabProps {
  projectId: string;
  onSelectTab?: (tab: string) => void;
}

export function VisitorInboxTab({ projectId, onSelectTab }: VisitorInboxTabProps) {
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isDemo = projectId === "demo" || projectId === "00000000-0000-4000-8000-000000000000";

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  // 1. Fetch conversations list
  const {
    data: conversations = [],
    isLoading: isListLoading,
    isError: isListError,
    error: listError,
    refetch: refetchList,
    isFetching: isListFetching,
  } = useQuery<VisitorConversation[]>({
    queryKey: ["project-visitor-conversations", projectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/conversations`));
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || "Failed to load visitor conversations");
      }
      return res.json();
    },
    staleTime: 30000,
  });

  // 2. Fetch selected conversation detail
  const {
    data: activeConversation,
    isLoading: isDetailLoading,
    isError: isDetailError,
    refetch: refetchDetail,
  } = useQuery<VisitorConversationDetail>({
    queryKey: ["project-visitor-conversation", projectId, selectedConvId],
    queryFn: async () => {
      if (!selectedConvId) return null as any;
      const res = await authFetch(apiUrl(`/api/projects/${projectId}/conversations/${selectedConvId}`));
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || "Failed to load conversation details");
      }
      return res.json();
    },
    enabled: !!selectedConvId,
    staleTime: 30000,
  });

  // Filter conversations client-side
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter((c) => {
      const matchId = c.id.toLowerCase().includes(q);
      const matchTitle = (c.title || "").toLowerCase().includes(q);
      const matchMsg = (c.lastMessage || "").toLowerCase().includes(q);
      const matchCustomer = (c.customerId || "").toLowerCase().includes(q);
      return matchId || matchTitle || matchMsg || matchCustomer;
    });
  }, [conversations, searchQuery]);

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
    toast({ title: "Session ID Copied", description: id });
  };

  const handleCopyTranscript = (conv: VisitorConversationDetail) => {
    if (!conv?.messages?.length) return;
    const transcriptText = conv.messages
      .map((m) => {
        const role = m.role === "user" ? "Visitor" : "NOVA AI";
        const time = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `[${time}] ${role}:\n${m.content}\n`;
      })
      .join("\n");

    navigator.clipboard.writeText(transcriptText);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
    toast({
      title: "Transcript Copied",
      description: "Full conversation transcript copied to clipboard.",
    });
  };

  const formatTimestamp = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const getVisitorDisplayName = (conv: VisitorConversation) => {
    if (conv.customerId) return `Customer #${conv.customerId.slice(0, 8)}`;
    if (conv.title && conv.title !== "Website Visitor Chat") return conv.title;
    return `Visitor #${conv.id.slice(0, 8)}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border shadow-xs">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-foreground">Website Visitor Inbox</h2>
              {isDemo && (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs px-2 py-0.5 rounded-full font-semibold">
                  Demo Sandbox Data
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs font-mono">
                {conversations.length} {conversations.length === 1 ? "Session" : "Sessions"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review live visitor inquiries, customer interest topics, and grounded NOVA AI responses from your website widget.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchList();
              if (selectedConvId) refetchDetail();
            }}
            disabled={isListFetching}
            className="h-9 rounded-xl border-border text-xs gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isListFetching ? "animate-spin text-primary" : ""}`} />
            <span>Refresh</span>
          </Button>

          {onSelectTab && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelectTab("widget-studio")}
              className="h-9 rounded-xl border-border text-xs gap-1.5 hidden md:inline-flex"
            >
              <span>Widget Studio</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Master-Detail Container */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[580px]">
        {/* Left Master List (4 cols on desktop) */}
        <div className={`md:col-span-5 lg:col-span-4 flex flex-col space-y-3 ${selectedConvId ? "hidden md:flex" : "flex"}`}>
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search visitor ID, topic, preview..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 rounded-xl bg-card border-border text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {/* Conversations Scroll Area */}
          <div className="flex-1 rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
            <div className="p-3 border-b border-border/60 bg-muted/30 flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>Visitor Sessions</span>
              <span>{filteredConversations.length} shown</span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[520px] p-2 space-y-1.5">
              {isListLoading ? (
                // Skeletons
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-3 rounded-xl border border-border/40 bg-muted/10 space-y-2">
                    <div className="flex justify-between items-center">
                      <Skeleton className="h-4 w-28 rounded-md" />
                      <Skeleton className="h-3 w-12 rounded-md" />
                    </div>
                    <Skeleton className="h-3 w-full rounded-md" />
                    <Skeleton className="h-3 w-2/3 rounded-md" />
                  </div>
                ))
              ) : isListError ? (
                // Error State
                <div className="p-6 text-center space-y-3">
                  <AlertCircle className="w-8 h-8 text-destructive mx-auto opacity-70" />
                  <p className="text-xs font-semibold text-foreground">Failed to load conversations</p>
                  <p className="text-[11px] text-muted-foreground">
                    {(listError as any)?.message || "Network error loading project visitor sessions."}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => refetchList()} className="text-xs h-8 rounded-lg">
                    Retry
                  </Button>
                </div>
              ) : filteredConversations.length === 0 ? (
                // Empty State
                <div className="p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                    <Inbox className="w-6 h-6 opacity-60" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {searchQuery ? "No matching conversations" : "No visitor chats yet"}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[240px] mx-auto">
                      {searchQuery
                        ? "Try adjusting your search terms to find visitor sessions."
                        : "Once your website widget is active, visitor questions will appear here."}
                    </p>
                  </div>
                  {!searchQuery && onSelectTab && (
                    <Button
                      size="sm"
                      onClick={() => onSelectTab("deployment")}
                      className="text-xs h-8 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                    >
                      Get Widget Code
                    </Button>
                  )}
                </div>
              ) : (
                // Conversation Cards
                filteredConversations.map((conv) => {
                  const isSelected = selectedConvId === conv.id;
                  const displayName = getVisitorDisplayName(conv);
                  const timeStr = formatTimestamp(conv.updatedAt || conv.createdAt);

                  return (
                    <div
                      key={conv.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedConvId(conv.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedConvId(conv.id);
                        }
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer select-none ${
                        isSelected
                          ? "bg-primary/10 border-primary/40 shadow-xs"
                          : "bg-background/40 border-border/50 hover:bg-muted/40 hover:border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          }`}>
                            <User className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-xs font-bold text-foreground truncate">
                            {displayName}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                          {timeStr}
                        </span>
                      </div>

                      {/* Preview Snippet */}
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed pl-7">
                        {conv.lastMessage ? (
                          <>
                            <span className="font-semibold text-foreground/80">
                              {conv.lastMessageRole === "user" ? "Visitor: " : "NOVA: "}
                            </span>
                            {conv.lastMessage}
                          </>
                        ) : (
                          <span className="italic opacity-60">Visitor session initiated</span>
                        )}
                      </p>

                      <div className="flex items-center justify-between mt-2 pl-7 pt-1 border-t border-border/30 text-[10px] text-muted-foreground">
                        <span className="font-mono">
                          {conv.messageCount ? `${conv.messageCount} messages` : "Active"}
                        </span>
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isSelected ? "text-primary translate-x-0.5" : "opacity-40"}`} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Detail Panel (7 or 8 cols on desktop) */}
        <div className={`md:col-span-7 lg:col-span-8 flex flex-col ${!selectedConvId ? "hidden md:flex" : "flex"}`}>
          <div className="flex-1 rounded-2xl border border-border bg-card overflow-hidden flex flex-col min-h-[520px]">
            {!selectedConvId ? (
              // Empty selection state
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
                <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center">
                  <MessageSquare className="w-8 h-8 opacity-70" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Select a conversation</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 leading-relaxed">
                    Choose any website visitor conversation on the left to inspect the complete question-and-answer exchange and verify AI grounding.
                  </p>
                </div>
              </div>
            ) : isDetailLoading ? (
              // Detail loading skeleton
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <Skeleton className="h-6 w-48 rounded-md" />
                  <Skeleton className="h-8 w-24 rounded-md" />
                </div>
                <div className="space-y-4 pt-4">
                  <div className="flex gap-3">
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                    <Skeleton className="h-16 w-3/4 rounded-2xl" />
                  </div>
                  <div className="flex gap-3 justify-end">
                    <Skeleton className="h-20 w-3/4 rounded-2xl" />
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                  </div>
                  <div className="flex gap-3">
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                    <Skeleton className="h-14 w-2/3 rounded-2xl" />
                  </div>
                </div>
              </div>
            ) : isDetailError || !activeConversation ? (
              // Detail Error state
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
                <AlertCircle className="w-10 h-10 text-destructive opacity-80" />
                <h3 className="text-sm font-bold text-foreground">Conversation unavailable</h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                  This conversation could not be retrieved. It may have expired or been deleted.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelectedConvId(null)} className="text-xs">
                    Back to Inbox
                  </Button>
                  <Button size="sm" onClick={() => refetchDetail()} className="text-xs">
                    Retry
                  </Button>
                </div>
              </div>
            ) : (
              // Render Conversation Messages Thread
              <>
                {/* Detail Header */}
                <div className="p-4 border-b border-border/80 bg-muted/20 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedConvId(null)}
                      className="md:hidden h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="w-4 h-4 mr-1" />
                      Back
                    </Button>

                    <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <User className="w-4 h-4" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-foreground">
                          {getVisitorDisplayName(activeConversation)}
                        </h3>
                        <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                          {activeConversation.messages?.length || 0} messages
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>Started {new Date(activeConversation.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyId(activeConversation.id)}
                      className="h-8 text-xs rounded-xl border-border gap-1"
                      title="Copy Session ID"
                    >
                      {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline font-mono">{activeConversation.id.slice(0, 8)}</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyTranscript(activeConversation)}
                      className="h-8 text-xs rounded-xl border-border gap-1"
                    >
                      {copiedTranscript ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Copy Transcript</span>
                    </Button>
                  </div>
                </div>

                {/* Messages Body */}
                <div className="flex-1 overflow-y-auto max-h-[500px] p-4 sm:p-6 space-y-4 bg-background/50">
                  {(!activeConversation.messages || activeConversation.messages.length === 0) ? (
                    <div className="p-8 text-center text-xs text-muted-foreground italic">
                      No messages recorded in this conversation session yet.
                    </div>
                  ) : (
                    activeConversation.messages.map((msg) => {
                      const isVisitor = msg.role === "user";
                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-3 max-w-[88%] ${isVisitor ? "mr-auto" : "ml-auto flex-row-reverse"}`}
                        >
                          {/* Avatar */}
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            isVisitor
                              ? "bg-muted text-muted-foreground border border-border/80"
                              : "bg-primary text-primary-foreground shadow-xs"
                          }`}>
                            {isVisitor ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                          </div>

                          {/* Message Content Bubble */}
                          <div className={`space-y-1.5 ${isVisitor ? "text-left" : "text-right"}`}>
                            {/* Role Label & Timestamp */}
                            <div className={`flex items-center gap-2 text-[11px] text-muted-foreground ${
                              isVisitor ? "justify-start" : "justify-end"
                            }`}>
                              <span className="font-semibold text-foreground/80">
                                {isVisitor ? "Website Visitor" : "NOVA AI Assistant"}
                              </span>
                              <span>•</span>
                              <span className="font-mono">
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>

                            {/* Bubble Body */}
                            <div className={`p-4 rounded-2xl text-xs leading-relaxed text-left shadow-xs ${
                              isVisitor
                                ? "bg-muted/70 text-foreground border border-border/70 rounded-tl-sm"
                                : "bg-primary/10 text-foreground border border-primary/25 rounded-tr-sm"
                            }`}>
                              <p className="whitespace-pre-wrap">{msg.content}</p>

                              {/* Grounding Transparency Badge on AI answers */}
                              {!isVisitor && (msg.sourceTransparency || msg.confidence) && (
                                <div className="mt-3 pt-2 border-t border-border/40 flex flex-wrap items-center gap-1.5">
                                  {msg.sourceTransparency && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1"
                                    >
                                      <Database className="w-2.5 h-2.5" />
                                      <span>Source: {msg.sourceTransparency}</span>
                                    </Badge>
                                  )}
                                  {msg.confidence && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-primary/10 text-primary border-primary/20 gap-1"
                                    >
                                      <ShieldCheck className="w-2.5 h-2.5" />
                                      <span>Confidence: {msg.confidence}</span>
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
