import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, StopCircle, Loader2, ChevronDown, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { cn } from "@/lib/utils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type Message = {
  id: number;
  role: string;
  content: string;
  createdAt: string;
};

type Project = {
  id: number;
  name: string;
  description: string | null;
  shareToken: string;
  isActive: boolean;
};

async function fetchProject(token: string): Promise<Project> {
  const res = await fetch(`${basePath}/api/projects/share/${token}`);
  if (!res.ok) throw new Error("Project not found");
  return res.json();
}

async function createConversation(token: string): Promise<{ id: number }> {
  const res = await fetch(`${basePath}/api/projects/share/${token}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to start chat");
  return res.json();
}

async function loadConversation(token: string, convId: number): Promise<{ messages: Message[] }> {
  const res = await fetch(`${basePath}/api/projects/share/${token}/conversations/${convId}`);
  if (!res.ok) throw new Error("Conversation not found");
  return res.json();
}

export default function SharedChatPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [projectError, setProjectError] = useState(false);
  const [convId, setConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const storageKey = `shared_conv_${token}`;

  const scrollToBottom = useCallback((smooth = false) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "instant",
      });
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 80;
    atBottomRef.current = nearBottom;
    setShowScrollBtn(!nearBottom);
  }, []);

  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  // Load project + conversation on mount
  useEffect(() => {
    if (!token) return;
    const init = async () => {
      try {
        const proj = await fetchProject(token);
        setProject(proj);

        // Check for existing conversation in localStorage
        const existingConvId = localStorage.getItem(storageKey);
        let convIdToUse: number | null = null;

        if (existingConvId) {
          try {
            const data = await loadConversation(token, Number(existingConvId));
            convIdToUse = Number(existingConvId);
            setMessages(data.messages);
          } catch {
            localStorage.removeItem(storageKey);
          }
        }

        if (!convIdToUse) {
          const conv = await createConversation(token);
          convIdToUse = conv.id;
          localStorage.setItem(storageKey, String(conv.id));
        }

        setConvId(convIdToUse);
      } catch {
        setProjectError(true);
      } finally {
        setIsLoading(false);
        atBottomRef.current = true;
        setTimeout(() => scrollToBottom(), 100);
      }
    };
    init();
  }, [token, storageKey, scrollToBottom]);

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
    setStreamingContent("");
  };

  const sendMessage = async () => {
    if (!input.trim() || !convId || isStreaming) return;
    const content = input.trim();
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    atBottomRef.current = true;
    setTimeout(() => scrollToBottom(), 50);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(
        `${basePath}/api/projects/share/${token}/conversations/${convId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        }
      );

      if (!response.ok) throw new Error("Failed to send message");
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.done) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: Date.now() + 1,
                    role: "assistant",
                    content: fullContent,
                    createdAt: new Date().toISOString(),
                  },
                ]);
                setStreamingContent("");
                setIsStreaming(false);
                abortControllerRef.current = null;
              } else if (json.content) {
                fullContent += json.content;
                setStreamingContent((prev) => prev + json.content);
              } else if (json.error) {
                throw new Error(json.error);
              }
            } catch (e) {
              if (!(e instanceof SyntaxError)) throw e;
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast({ title: "Failed to send message", variant: "destructive" });
      setIsStreaming(false);
      setStreamingContent("");
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewChat = async () => {
    if (!token) return;
    localStorage.removeItem(storageKey);
    setMessages([]);
    setInput("");
    try {
      const conv = await createConversation(token);
      setConvId(conv.id);
      localStorage.setItem(storageKey, String(conv.id));
    } catch {
      toast({ title: "Failed to start new chat", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
          <Bot className="w-7 h-7 text-zinc-500" />
        </div>
        <div>
          <p className="text-white font-semibold text-lg">Chatbot not found</p>
          <p className="text-zinc-500 text-sm mt-1">
            This link may be invalid, expired, or has been deactivated.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground">
      <div className="absolute top-[-10%] left-[-5%] w-[35%] h-[35%] bg-primary/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[35%] h-[35%] bg-blue-500/15 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-white/8 bg-background/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">{project.name}</p>
            {project.description && (
              <p className="text-zinc-500 text-xs leading-tight">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600">Powered by Aria AI</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={startNewChat}
            className="text-xs text-zinc-500 hover:text-white h-7 px-2"
          >
            New chat
          </Button>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative z-10 flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="max-w-2xl mx-auto space-y-6">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-white/10 flex items-center justify-center">
                <Bot className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <p className="text-white font-medium">Hi! I'm {project.name}</p>
                <p className="text-zinc-500 text-sm mt-1">
                  {project.description ?? "Ask me anything — I'm here to help!"}
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                  msg.role === "user"
                    ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-br-sm"
                    : "bg-white/5 border border-white/8 text-zinc-100 rounded-bl-sm"
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {/* Streaming message */}
          {isStreaming && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm bg-white/5 border border-white/8 text-zinc-100">
                {streamingContent ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                      {streamingContent}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { atBottomRef.current = true; scrollToBottom(true); }}
            className="rounded-full border-white/15 bg-background/90 backdrop-blur-sm text-zinc-400 hover:text-white shadow-lg gap-1.5 text-xs"
          >
            <ChevronDown className="w-3 h-3" />
            Scroll to bottom
          </Button>
        </div>
      )}

      {/* Input bar */}
      <div className="relative z-10 px-4 py-4 border-t border-white/8 bg-background/80 backdrop-blur-md shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus-within:border-primary/50 focus-within:bg-white/[0.07] transition-all">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${project.name}…`}
              className="flex-1 bg-transparent border-0 p-0 text-sm text-white placeholder:text-zinc-600 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[24px] max-h-[120px]"
              rows={1}
              disabled={isStreaming}
            />
            {isStreaming ? (
              <Button
                size="icon"
                onClick={stopStreaming}
                className="w-8 h-8 shrink-0 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400"
              >
                <StopCircle className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={!input.trim()}
                className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 border-0 text-white disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
          <p className="text-center text-xs text-zinc-700 mt-2">
            Powered by <span className="text-zinc-500">Aria AI</span>
          </p>
        </div>
      </div>
    </div>
  );
}
