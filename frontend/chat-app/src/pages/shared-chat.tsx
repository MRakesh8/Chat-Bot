import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  StopCircle,
  Loader2,
  ChevronDown,
  Bot,
  Paperclip,
  Mic,
  X,
  Copy,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api-url";
import { RotatingStatus } from "@/components/rotating-status";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type Message = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

type UploadedFile = {
  file: File;
  id?: string;
  uploading: boolean;
  preview?: string;
};

type Project = {
  id: string;
  name: string;
  description: string | null;
  shareToken: string;
  isActive: boolean;
};

async function fetchProject(token: string): Promise<Project> {
  const res = await fetch(apiUrl(`/api/projects/share/${token}`));
  if (!res.ok) throw new Error("Project not found");
  return res.json();
}

async function createConversation(token: string): Promise<{ id: string }> {
  const res = await fetch(apiUrl(`/api/projects/share/${token}/conversations`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to start chat");
  return res.json();
}

async function loadConversation(token: string, convId: string): Promise<{ messages: Message[] }> {
  const res = await fetch(apiUrl(`/api/projects/share/${token}/conversations/${convId}`));
  if (!res.ok) throw new Error("Conversation not found");
  return res.json();
}

const SharedMemoizedMessage = memo(function SharedMemoizedMessage({
  msg,
  onCopy,
}: {
  msg: Message;
  onCopy: (content: string) => void;
}) {
  return (
    <div className={cn("flex gap-3 group", msg.role === "user" ? "justify-end" : "justify-start")}>
      {msg.role === "assistant" && (
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shrink-0 mt-1">
          <Bot className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm relative",
          msg.role === "user"
            ? "bg-[#2B2B2B] text-[#FFFFFF]"
            : "bg-card border border-border text-foreground rounded-bl-sm"
        )}
      >
        {msg.role === "assistant" ? (
          <>
            <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-muted prose-pre:border prose-pre:border-border">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  a({ node, children, href, ...props }: any) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-semibold"
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  }
                }}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-6 w-6 transition-opacity text-muted-foreground hover:text-foreground opacity-100"
              onClick={() => onCopy(msg.content)}
            >
              <Copy className="w-3 h-3" />
            </Button>
          </>
        ) : (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        )}
      </div>
      {msg.role === "user" && (
        <div className="mb-4 text-muted-foreground flex shrink-0">
          <CheckCircle2 className="h-4 w-4" />
        </div>
      )}
    </div>
  );
});

export default function SharedChatPage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [projectError, setProjectError] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

        const existingConvId = localStorage.getItem(storageKey);
        let convIdToUse: string | null = null;

        if (existingConvId) {
          try {
            const data = await loadConversation(token, existingConvId);
            convIdToUse = existingConvId;
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

  // ─── File upload ──────────────────────────────────────────────────────────

  const uploadFile = async (file: File): Promise<string | null> => {
    if (!project?.id) return null;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectId", project.id);
    try {
      const res = await fetch(apiUrl("/api/files/upload"), {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      return data.id ?? null;
    } catch {
      return null;
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const selected = Array.from(e.target.files);
    for (const file of selected) {
      const preview = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined;
      setFiles((prev) => [...prev, { file, uploading: true, preview }]);
      const id = await uploadFile(file);
      if (id != null) {
        setFiles((prev) =>
          prev.map((f) => (f.file === file ? { ...f, id, uploading: false } : f))
        );
      } else {
        toast({ title: "Upload failed", description: file.name, variant: "destructive" });
        setFiles((prev) => prev.filter((f) => f.file !== file));
      }
    }
    e.target.value = "";
  };

  const removeFile = (file: File) => {
    setFiles((prev) => {
      const entry = prev.find((f) => f.file === file);
      if (entry?.preview) URL.revokeObjectURL(entry.preview);
      return prev.filter((f) => f.file !== file);
    });
  };

  // ─── Voice input ──────────────────────────────────────────────────────────

  const startVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Not supported", description: "Voice input isn't available in this browser." });
      return;
    }
    setIsRecording(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let finalTranscript = "";
    recognition.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setInput(finalTranscript + interim);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognition.start();
  };

  // ─── Send message ─────────────────────────────────────────────────────────

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
    setStreamingContent("");
  };

  const sendMessage = async () => {
    if ((!input.trim() && files.length === 0) || !convId || isStreaming) return;

    const content = input.trim();
    const fileIds = files.filter((f) => f.id).map((f) => f.id!);

    setInput("");
    setFiles([]);
    setIsStreaming(true);
    setStreamingContent("");

    const userMsg: Message = {
      id: `temp-user-${Date.now()}`,
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
        apiUrl(`/api/projects/share/${token}/conversations/${convId}/messages`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, fileIds }),
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
                    id: `temp-assistant-${Date.now()}`,
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

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!" });
  }, [toast]);

  const startNewChat = async () => {
    if (!token) return;
    localStorage.removeItem(storageKey);
    setMessages([]);
    setInput("");
    setFiles([]);
    try {
      const conv = await createConversation(token);
      setConvId(conv.id);
      localStorage.setItem(storageKey, String(conv.id));
    } catch {
      toast({ title: "Failed to start new chat", variant: "destructive" });
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

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
        <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center">
          <Bot className="w-7 h-7 text-muted-foreground" />
        </div>
        <div>
          <p className="text-foreground font-semibold text-lg">Chatbot not found</p>
          <p className="text-muted-foreground text-sm mt-1">
            This link may be invalid, expired, or has been deactivated.
          </p>
        </div>
      </div>
    );
  }

  const canSend = (input.trim().length > 0 || files.length > 0) && !isStreaming;

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground">
      <div className="absolute top-[-10%] left-[-5%] w-[35%] h-[35%] bg-primary/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[35%] h-[35%] bg-blue-500/15 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Back"
            aria-label="Back"
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else setLocation("/");
            }}
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-foreground font-semibold text-sm leading-tight">{project.name}</p>
            {project.description && (
              <p className="text-muted-foreground text-xs leading-tight">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:block">Powered by Aria AI</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={startNewChat}
            className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
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
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-border flex items-center justify-center">
                <Bot className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <p className="text-foreground font-medium">Hi! I'm {project.name}</p>
                <p className="text-muted-foreground text-sm mt-1">
                  {project.description ?? "Ask me anything — I'm here to help!"}
                </p>
                <p className="text-muted-foreground text-xs mt-3">
                  You can send text, images, PDFs, files, or paste a YouTube link
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <SharedMemoizedMessage key={msg.id} msg={msg} onCopy={copyToClipboard} />
          ))}

          {/* Streaming */}
          {isStreaming && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-3.5 h-3.5 text-primary-foreground animate-pulse" />
              </div>
              <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm bg-card border border-border text-foreground">
                {streamingContent ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-muted prose-pre:border prose-pre:border-border">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={{
                        a({ node, children, href, ...props }: any) {
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline font-semibold"
                              {...props}
                            >
                              {children}
                            </a>
                          );
                        }
                      }}
                    >
                      {streamingContent}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 h-5">
                    <RotatingStatus className="text-primary text-xs font-medium" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { atBottomRef.current = true; scrollToBottom(true); }}
            className="rounded-full border-border bg-background/90 backdrop-blur-sm text-muted-foreground hover:text-foreground shadow-lg gap-1.5 text-xs"
          >
            <ChevronDown className="w-3 h-3" />
            Scroll to bottom
          </Button>
        </div>
      )}

      {/* Input bar */}
      <div className="relative z-10 px-4 py-4 border-t border-border bg-background/80 backdrop-blur-md shrink-0">
        <div className="max-w-2xl mx-auto">

          {/* File previews */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-muted border border-border rounded-xl px-3 py-1.5 text-xs text-foreground"
                >
                  {f.preview ? (
                    <img src={f.preview} alt={f.file.name} className="w-6 h-6 rounded object-cover" />
                  ) : (
                    <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate max-w-[120px]">{f.file.name}</span>
                  {f.uploading ? (
                    <Loader2 className="w-3 h-3 animate-spin shrink-0 text-muted-foreground" />
                  ) : (
                    <button
                      onClick={() => removeFile(f.file)}
                      className="hover:text-destructive shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Input box */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden focus-within:border-primary/40 focus-within:bg-muted transition-all">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${project.name}… (paste a YouTube link, attach files, or type)`}
              className="w-full bg-transparent border-0 p-4 pb-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[52px] max-h-[160px]"
              rows={1}
              disabled={isStreaming}
            />

            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*,.pdf,.txt,.doc,.docx,.csv,.json,.md"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Attach image, PDF, or file"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Voice input"
                  onClick={startVoiceInput}
                  disabled={isStreaming}
                  className={cn(
                    "h-8 w-8 rounded-xl transition-colors",
                    isRecording
                      ? "text-red-500 bg-red-500/10 hover:bg-red-500/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Mic className="w-4 h-4" />
                </Button>
              </div>

              {isStreaming ? (
                <Button
                  size="icon"
                  onClick={stopStreaming}
                  className="w-8 h-8 shrink-0 rounded-xl bg-destructive/20 hover:bg-destructive/30 border border-destructive/30 text-destructive"
                >
                  <StopCircle className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={sendMessage}
                  disabled={!canSend}
                  className={cn(
                    "w-8 h-8 shrink-0 rounded-xl border-0 transition-all",
                    canSend
                      ? "bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-2">
            Powered by <span className="text-foreground">Aria AI</span>
          </p>
        </div>
      </div>
    </div>
  );
}
