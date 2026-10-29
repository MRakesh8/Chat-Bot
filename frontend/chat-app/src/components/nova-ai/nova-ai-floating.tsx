import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useNovaAi } from "@/contexts/NovaAiContext";
import { apiUrl } from "@/lib/api-url";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { 
  Sparkles, 
  X, 
  Minus, 
  Send, 
  Loader2, 
  Maximize2, 
  Bot, 
  User, 
  Copy, 
  Check, 
  Compass, 
  HelpCircle, 
  Layers, 
  RefreshCw,
  Sun,
  Moon
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface MessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export function NovaAiAssistantFloating() {
  const { isOpen, isMinimized, toggleMinimize, closeAssistant, openAssistant } = useNovaAi();
  const [location, setLocation] = useLocation();
  const { user, dbUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const authFetch = useAuthFetch();

  const [inputMsg, setInputMsg] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationIdRef = useRef<string | null>(null);

  // Extract current project ID if present in URL
  const projectMatch = location.match(/\/projects\/([^\/]+)/);
  const currentProjectId = projectMatch && projectMatch[1] !== "new" ? projectMatch[1] : null;

  // Fetch current project metadata if inside a project
  const { data: currentProject } = useQuery({
    queryKey: ["nova-ai-current-project", currentProjectId],
    queryFn: async () => {
      if (!currentProjectId) return null;
      const res = await authFetch(apiUrl(`/api/projects/${currentProjectId}`));
      if (!res.ok) return null;
      return res.json() as Promise<{ id: string; name: string; isActive: boolean }>;
    },
    enabled: !!currentProjectId,
    staleTime: 1000 * 60 * 5,
  });

  // Determine current screen label
  const getScreenLabel = () => {
    if (location === "/" || location.startsWith("/chat")) return "Chat Workspace";
    if (location.startsWith("/projects/new")) return "New Project";
    if (location.startsWith("/projects/") && location.includes("tab=widget-studio")) return "Widget Studio";
    if (location.startsWith("/projects/") && location.endsWith("/edit")) return "Project Settings";
    if (location.startsWith("/projects")) return "Projects List";
    if (location.startsWith("/services")) return "Connected Services";
    if (location.startsWith("/billing")) return "Billing & Subscriptions";
    if (location.startsWith("/settings")) return "Workspace Settings";
    if (location.startsWith("/profile")) return "UserProfile";
    if (location.startsWith("/admin")) return "Admin Console";
    return "NOVA Workspace";
  };

  const currentScreenName = getScreenLabel();

  // Conversation history state
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: "initial-greeting",
      role: "assistant",
      content: "👋 Hi! I'm **✨ NOVA AI**, your platform assistant. I understand your current workspace screen, active projects, and platform features. How can I help you today?",
      timestamp: new Date(),
    },
  ]);

  // Auto-scroll to bottom of conversation
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollToBottom();
    }
  }, [messages, isOpen, isMinimized]);

  // Listen for Escape key to close/minimize
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (!isMinimized) {
          toggleMinimize();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isMinimized, toggleMinimize]);

  if (!isOpen) return null;

  // Minimized Pill Launcher
  if (isMinimized) {
    return (
      <div className="fixed bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
        <Button
          onClick={openAssistant}
          className="flex items-center gap-2.5 h-11 px-4 rounded-full bg-gradient-to-r from-violet-600 via-primary to-indigo-600 text-white font-semibold shadow-2xl border border-white/20 hover:scale-105 active:scale-95 transition-all group"
          title="Reopen ✨ NOVA AI Assistant"
        >
          <div className="relative">
            <Sparkles className="w-4 h-4 animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-white" />
          </div>
          <span className="text-sm font-bold">✨ NOVA AI</span>
          <Badge variant="outline" className="text-[10px] bg-white/20 text-white border-white/30 px-1.5 py-0.2 rounded-full">
            Active
          </Badge>
          <Maximize2 className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity ml-1" />
        </Button>
      </div>
    );
  }

  // Handle Quick Prompt Suggestions
  const handlePromptSuggestion = (promptText: string) => {
    handleSendMessage(promptText);
  };

  // Copy message text helper
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Theme Action Handler
  const handleThemeAction = (content: string) => {
    const lower = content.toLowerCase();
    if (lower.includes("light theme") || lower.includes("light mode")) {
      setTheme("light");
      return "I have switched the workspace theme to **Light Mode**.";
    }
    if (lower.includes("dark theme") || lower.includes("dark mode")) {
      setTheme("dark");
      return "I have switched the workspace theme to **Dark Mode**.";
    }
    return null;
  };

  // Send Message Handler
  const handleSendMessage = async (textToSend?: string) => {
    const queryText = (textToSend || inputMsg).trim();
    if (!queryText || isSending) return;

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    const newUserMsg: MessageItem = {
      id: userMsgId,
      role: "user",
      content: queryText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newUserMsg]);
    if (!textToSend) setInputMsg("");
    setIsSending(true);

    // 1. Check client-side Theme Action first
    const themeResponse = handleThemeAction(queryText);
    if (themeResponse) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMsgId,
            role: "assistant",
            content: themeResponse,
            timestamp: new Date(),
          },
        ]);
        setIsSending(false);
      }, 300);
      return;
    }

    // 2. Prepare structured context payload (Requirement 5)
    const currentContext = {
      currentRoute: location,
      currentScreen: currentScreenName,
      currentProjectId: currentProjectId || null,
      currentProjectName: currentProject?.name || null,
      userId: user?.id,
      userRole: dbUser?.role || "user",
      availableActions: ["navigate", "theme", "guide_explain", "widget_settings"]
    };

    // Add streaming assistant placeholder
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      },
    ]);

    // Ensure we have a valid conversation session
    let convId = conversationIdRef.current;
    if (!convId) {
      try {
        const convRes = await authFetch(apiUrl("/api/gemini/conversations"), {
          method: "POST",
          body: JSON.stringify({
            title: "✨ NOVA AI Assistant",
            projectId: currentProjectId || undefined,
          }),
        });
        if (convRes.ok) {
          const convData = await convRes.json();
          if (convData?.id) {
            convId = convData.id;
            conversationIdRef.current = convData.id;
          }
        }
      } catch (err) {
        console.warn("Could not pre-create session, falling back to auto-provisioning", err);
      }
    }

    try {
      const targetSessionId = convId || "nova-ai-session";
      const res = await authFetch(apiUrl(`/api/gemini/conversations/${targetSessionId}/messages`), {
        method: "POST",
        body: JSON.stringify({
          content: queryText,
          useNormalAi: false,
          currentContext,
        }),
      });

      if (!res.ok) {
        let errMsg = `Server status ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson?.error) errMsg = errJson.error;
        } catch {}
        throw new Error(errMsg);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let streamedText = "";

      if (reader) {
        let done = false;
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const dataStr = line.replace("data: ", "").trim();
                  if (!dataStr || dataStr === "[DONE]") continue;
                  const parsed = JSON.parse(dataStr);
                  if (parsed.conversationId && !conversationIdRef.current) {
                    conversationIdRef.current = parsed.conversationId;
                  }
                  if (parsed.content) {
                    streamedText += parsed.content;
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMsgId ? { ...msg, content: streamedText } : msg
                      )
                    );
                  }
                  if (parsed.intent === "navigation" && parsed.action?.route) {
                    // Dispatch wouter navigation
                    window.dispatchEvent(new CustomEvent("nova:navigate", { detail: { route: parsed.action.route } }));
                  }
                } catch {
                  // Ignore SSE parse errors for partial chunks
                }
              }
            }
          }
        }
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, isStreaming: false, content: streamedText || "Task completed." }
            : msg
        )
      );
    } catch (err: any) {
      // Safe error handling (Requirement 15)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                isStreaming: false,
                content: err?.message && !err.message.includes("Server status")
                  ? `⚠️ ${err.message}`
                  : "I'm having trouble connecting right now. Please try again in a few moments.",
              }
            : msg
        )
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[400px] h-[540px] max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
      <Card className="h-full w-full flex flex-col bg-card/95 backdrop-blur-xl border border-primary/25 shadow-2xl rounded-2xl overflow-hidden">
        {/* Header */}
        <CardHeader className="py-3 px-4 bg-gradient-to-r from-violet-950/80 via-background to-indigo-950/80 border-b border-border/80 flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-violet-600 via-primary to-indigo-500 flex items-center justify-center text-white shadow-md shrink-0">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground tracking-tight truncate">✨ NOVA AI</h2>
                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 px-1.5 py-0 rounded-full font-medium">
                  Internal Assistant
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                Screen: <span className="font-medium text-foreground">{currentScreenName}</span>
                {currentProject && ` • ${currentProject.name}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMinimize}
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Minimize panel (-)"
            >
              <Minus className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={closeAssistant}
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Close panel (Esc)"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        {/* Message Log Body */}
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground font-medium rounded-tr-xs"
                    : "bg-secondary/80 border border-border/80 text-foreground rounded-tl-xs shadow-xs"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>

                {msg.isStreaming && !msg.content && (
                  <div className="flex items-center gap-1.5 text-muted-foreground py-1">
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                    <span className="text-[11px] animate-pulse">Thinking...</span>
                  </div>
                )}

                {msg.role === "assistant" && msg.content && (
                  <div className="flex items-center justify-between mt-1.5 pt-1 border-t border-border/40 text-[10px] text-muted-foreground">
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="hover:text-foreground transition-colors flex items-center gap-1"
                      title="Copy response"
                    >
                      {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}
              </div>

              {msg.role === "user" && (
                <div className="h-7 w-7 rounded-lg bg-secondary border border-border flex items-center justify-center text-muted-foreground shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))}

          {/* Quick Action Suggestion Pills */}
          {messages.length <= 2 && (
            <div className="pt-2 space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <Compass className="w-3 h-3 text-primary" /> Suggested Prompts:
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => handlePromptSuggestion("What is this screen?")}
                  className="px-2.5 py-1 rounded-full bg-secondary/60 hover:bg-primary/10 border border-border/80 text-foreground hover:text-primary text-[11px] font-medium transition-colors"
                >
                  "What is this screen?"
                </button>
                <button
                  onClick={() => handlePromptSuggestion("How do I customize my chatbot?")}
                  className="px-2.5 py-1 rounded-full bg-secondary/60 hover:bg-primary/10 border border-border/80 text-foreground hover:text-primary text-[11px] font-medium transition-colors"
                >
                  "How do I customize my chatbot?"
                </button>
                <button
                  onClick={() => handlePromptSuggestion("Open Widget Studio")}
                  className="px-2.5 py-1 rounded-full bg-secondary/60 hover:bg-primary/10 border border-border/80 text-foreground hover:text-primary text-[11px] font-medium transition-colors"
                >
                  "Open Widget Studio"
                </button>
                <button
                  onClick={() => handlePromptSuggestion("Switch to dark theme")}
                  className="px-2.5 py-1 rounded-full bg-secondary/60 hover:bg-primary/10 border border-border/80 text-foreground hover:text-primary text-[11px] font-medium transition-colors"
                >
                  "Switch to dark theme"
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </CardContent>

        {/* Footer Input Bar */}
        <CardFooter className="p-3 bg-card border-t border-border/80 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2 w-full"
          >
            <Input
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              placeholder="Ask NOVA AI..."
              disabled={isSending}
              className="flex-1 h-9 text-xs bg-secondary/50 border-border/80 focus-visible:ring-primary rounded-xl"
            />
            <Button
              type="submit"
              disabled={!inputMsg.trim() || isSending}
              size="icon"
              className="h-9 w-9 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
