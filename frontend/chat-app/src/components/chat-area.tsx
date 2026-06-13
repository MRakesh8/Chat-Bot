import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  getGetGeminiConversationQueryKey,
  getListGeminiConversationsQueryKey,
  getListGeminiMessagesQueryKey,
  useCreateGeminiConversation,
  useGetGeminiConversation,
  useListGeminiMessages,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  Loader2,
  Mic,
  Paperclip,
  RotateCcw,
  Send,
  Sparkle,
  StopCircle,
  X,
  CheckCircle2,
} from "lucide-react";
import "highlight.js/styles/github-dark.css";
import { RotatingStatus } from "@/components/rotating-status";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useChatStream } from "@/hooks/use-chat-stream";
import { apiUrl } from "@/lib/api-url";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

type Project = { id: string; name: string; isActive: boolean };

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const MemoizedMessage = memo(function MemoizedMessage({
  msg,
  basePath,
  hasSelectedProjects,
  isSelected,
  onToggleSelection,
  onAddToProject,
  onCopy,
  onRegenerate,
}: {
  msg: any;
  basePath: string;
  hasSelectedProjects: boolean;
  isSelected: boolean;
  onToggleSelection: (id: string) => void;
  onAddToProject: (content: string) => void;
  onCopy: (content: string) => void;
  onRegenerate: () => void;
}) {
  return (
    <div className={cn("group flex items-end gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
      {hasSelectedProjects && msg.role !== "user" && (
        <input
          type="checkbox"
          className="mb-4 h-4 w-4 rounded border-border accent-primary"
          checked={isSelected}
          onChange={() => onToggleSelection(msg.id)}
        />
      )}
      <div
        className={cn(
          "max-w-[88%] rounded-2xl px-5 py-3.5 text-sm shadow-sm",
          msg.role === "user"
            ? "bg-white/10 text-white backdrop-blur-md border border-white/5"
            : "bg-transparent text-foreground",
          isSelected && "ring-2 ring-primary/50",
        )}
      >
        {msg.role !== "user" && (
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <img src={`${basePath}/logo.svg`} alt="Aria" className="h-5 w-5" />
              <span className="text-xs font-medium text-muted-foreground">Aria</span>
            </div>
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {hasSelectedProjects && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-primary hover:bg-primary/10"
                  onClick={() => onAddToProject(msg.content)}
                >
                  Add to Project
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onCopy(msg.content)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRegenerate}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
        <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:border prose-pre:border-border prose-pre:bg-muted">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight, rehypeSanitize]}>
            {msg.content}
          </ReactMarkdown>
        </div>
      </div>
      {hasSelectedProjects && msg.role === "user" && (
        <input
          type="checkbox"
          className="mb-4 h-4 w-4 rounded border-border accent-primary"
          checked={isSelected}
          onChange={() => onToggleSelection(msg.id)}
        />
      )}
      {msg.role === "user" && (
        <div className="mb-4 text-muted-foreground flex shrink-0">
          <CheckCircle2 className="h-4 w-4" />
        </div>
      )}
    </div>
  );
});

export function ChatArea() {
  const { id } = useParams();
  const conversationId = id;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createConversation = useCreateGeminiConversation();
  const { sendMessage, isStreaming, streamingContent, stopStreaming } = useChatStream();
  const { toast } = useToast();
  const { session } = useAuth();

  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [files, setFiles] = useState<{ file: File; id?: string; uploading: boolean }[]>([]);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set(["normal"]));
  const [targetProjectId, setTargetProjectId] = useState("");
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: conversation } = useGetGeminiConversation(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getGetGeminiConversationQueryKey(conversationId!) },
  });

  const { data: messages } = useListGeminiMessages(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getListGeminiMessagesQueryKey(conversationId!) },
  });

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
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
    },
    [session],
  );

  const { data: projectList } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/projects"));
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json() as Promise<Project[]>;
    },
  });

  const selectedProjectIds = useMemo(
    () => Array.from(selectedSources).filter((source) => source !== "normal"),
    [selectedSources],
  );

  const displayName = useMemo(() => {
    const emailName = session?.user?.email?.split("@")[0];
    return emailName || "there";
  }, [session]);

  const scrollToBottom = useCallback((smooth = false) => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: smooth ? "smooth" : "instant",
    });
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

  useEffect(() => {
    atBottomRef.current = true;
    setShowScrollBtn(false);
    scrollToBottom();
  }, [conversationId, scrollToBottom]);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    if (conversationId) formData.append("conversationId", String(conversationId));

    try {
      const { data } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;

      const res = await fetch(apiUrl("/api/files/upload"), {
        method: "POST",
        body: formData,
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Upload failed");
      return await res.json();
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const selectedFiles = Array.from(e.target.files);
    for (const file of selectedFiles) {
      setFiles((prev) => [...prev, { file, uploading: true }]);
      const res = await uploadFile(file);
      if (res?.id) {
        setFiles((prev) => prev.map((f) => (f.file === file ? { ...f, id: res.id, uploading: false } : f)));
      } else {
        toast({ title: "Upload failed", description: `Failed to upload ${file.name}`, variant: "destructive" });
        setFiles((prev) => prev.filter((f) => f.file !== file));
      }
    }
    e.target.value = "";
  };

  const handleSend = async () => {
    if (!input.trim() && files.length === 0) return;

    const messageText = input;
    const fileIds = files.filter((f) => f.id).map((f) => f.id!);
    const useNormalAi = selectedSources.has("normal");
    let targetId = conversationId;

    setInput("");
    setFiles([]);
    atBottomRef.current = true;

    if (!targetId) {
      const newConv = await createConversation.mutateAsync({
        data: { title: messageText.trim().slice(0, 30) || "New Chat", projectId: null },
      });
      targetId = newConv.id;
      queryClient.invalidateQueries({ queryKey: getListGeminiConversationsQueryKey() });
      setLocation(`/chat/${targetId}`);
      
      const newMessage = {
        id: "optimistic-" + Date.now(),
        role: "user",
        content: messageText,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData(getListGeminiMessagesQueryKey(targetId), (old: any) => {
        if (!old) return [newMessage];
        return [...old, newMessage];
      });

      setTimeout(() => sendMessage(targetId!, messageText, fileIds, selectedProjectIds, useNormalAi), 50);
      return;
    }

    const newMessage = {
      id: "optimistic-" + Date.now(),
      role: "user",
      content: messageText,
      createdAt: new Date().toISOString(),
    };
    queryClient.setQueryData(getListGeminiMessagesQueryKey(targetId), (old: any) => {
      if (!old) return [newMessage];
      return [...old, newMessage];
    });

    sendMessage(targetId, messageText, fileIds, selectedProjectIds, useNormalAi);
    setTimeout(() => scrollToBottom(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Not supported", description: "Voice input is not supported in this browser." });
      return;
    }

    setIsRecording(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let finalTranscript = "";

    recognition.onresult = (e: any) => {
      let interimTranscript = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
        else interimTranscript += e.results[i][0].transcript;
      }
      setInput(finalTranscript + interimTranscript);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognition.start();
  };

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Message copied to clipboard." });
  }, [toast]);

  const regenerate = useCallback(() => {
    if (!conversationId || !messages?.length) return;
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (lastUser) sendMessage(conversationId, lastUser.content, [], selectedProjectIds, selectedSources.has("normal"));
  }, [conversationId, messages, sendMessage, selectedProjectIds, selectedSources]);

  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const addContentsToProject = useCallback(async (contents: string[], projectId: string) => {
    const res = await authFetch(apiUrl(`/api/projects/${projectId}/knowledge/from-chat`), {
      method: "POST",
      body: JSON.stringify({ contents }),
    });
    if (!res.ok) throw new Error("Failed to add to project knowledge");
  }, [authFetch]);

  const handleAddToProjectSingle = useCallback(async (content: string) => {
    const projectId = targetProjectId || selectedProjectIds[0];
    try {
      await addContentsToProject([content], projectId);
      toast({ title: "Added to knowledge" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  }, [targetProjectId, selectedProjectIds, addContentsToProject, toast]);

  const handleAddToProject = async () => {
    if (!targetProjectId || selectedMessages.size === 0) return;
    const contents = Array.from(selectedMessages)
      .map((messageId) => messages?.find((message) => message.id === messageId)?.content)
      .filter(Boolean) as string[];

    try {
      await addContentsToProject(contents, targetProjectId);
      toast({ title: "Added to knowledge", description: `Added ${contents.length} message(s) to project knowledge.` });
      setSelectedMessages(new Set());
    } catch {
      toast({ title: "Error", description: "Failed to add to project knowledge", variant: "destructive" });
    }
  };

  const renderInput = (isCentered = false) => (
    <div className={cn("mx-auto w-full max-w-3xl", !isCentered && "sticky bottom-4 z-20")}>
      <div className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl transition-shadow",
        "bg-card/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] focus-within:ring-1 focus-within:ring-primary/50 focus-within:border-primary/50",
        isCentered ? "shadow-xl" : "shadow-lg"
      )}>
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 pb-0">
            {files.map((f, i) => (
              <div key={`${f.file.name}-${i}`} className="flex max-w-full items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-xs text-foreground backdrop-blur">
                <span className="max-w-[180px] truncate">{f.file.name}</span>
                {f.uploading ? (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                ) : (
                  <button onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} className="shrink-0 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="How can I help you today?"
          rows={1}
          className="min-h-[60px] w-full resize-none bg-transparent px-4 py-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex items-center gap-1">
            <input type="file" id="file-upload" className="hidden" multiple onChange={handleFileChange} />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              title="Attach file"
              onClick={() => document.getElementById("file-upload")?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-9 w-9 rounded-full transition-colors",
                isRecording
                  ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
              title="Voice input"
              onClick={startVoiceInput}
            >
              <Mic className="h-4 w-4" />
            </Button>
          </div>

          {isStreaming ? (
            <Button size="icon" onClick={stopStreaming} className="h-9 w-9 rounded-full bg-muted text-muted-foreground hover:bg-accent">
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!input.trim() && files.length === 0}
              size="icon"
              className={cn(
                "h-9 w-9 rounded-full transition-all",
                input.trim() || files.length > 0
                  ? "bg-foreground text-background hover:bg-foreground/85"
                  : "bg-muted text-muted-foreground",
              )}
              title="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {!isCentered && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Aria can make mistakes. Consider verifying important information.
        </p>
      )}
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col bg-background">
      {conversationId ? (
        <div className="z-10 flex h-14 shrink-0 items-center justify-between border-b border-white/5 bg-background/60 px-14 backdrop-blur-xl md:px-5 shadow-sm">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Back to new chat"
              onClick={() => setLocation("/chat")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="max-w-[180px] truncate text-sm font-semibold text-foreground md:max-w-md">
              {conversation?.title || "Chat"}
            </h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 min-w-[132px] justify-between gap-2 bg-card text-xs text-foreground">
                {selectedSources.size === 0 ? "Select sources" : `${selectedSources.size} source(s)`}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[220px] border-border bg-popover text-popover-foreground">
              <DropdownMenuCheckboxItem
                checked={selectedSources.has("normal")}
                onCheckedChange={(checked) => {
                  setSelectedSources((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add("normal");
                    else next.delete("normal");
                    return next;
                  });
                }}
              >
                Normal AI
              </DropdownMenuCheckboxItem>
              <div className="my-1 h-px bg-border" />
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Projects</div>
              {projectList?.filter((p) => p.isActive).map((project) => (
                <DropdownMenuCheckboxItem
                  key={project.id}
                  checked={selectedSources.has(project.id)}
                  onCheckedChange={(checked) => {
                    setSelectedSources((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(project.id);
                      else next.delete(project.id);
                      return next;
                    });
                  }}
                >
                  {project.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <div className="h-14 shrink-0" />
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          conversationId ? "px-4 py-5 md:px-6" : "flex items-center justify-center px-3 pb-24 pt-4",
        )}
      >
        {!conversationId ? (
          <div className="w-full -translate-y-8 transition-transform duration-300 md:-translate-y-12">
            <h2 className="mb-8 flex flex-wrap items-center justify-center gap-3 text-center font-serif text-3xl text-foreground md:text-5xl">
              <Sparkle className="h-8 w-8 text-primary md:h-10 md:w-10" />
              <span>
                {greeting()}, {displayName}
              </span>
            </h2>
            {renderInput(true)}
          </div>
        ) : (
          <div className="mx-auto mt-auto w-full max-w-3xl space-y-6">
            {messages?.map((msg) => (
              <MemoizedMessage
                key={msg.id}
                msg={msg}
                basePath={basePath}
                hasSelectedProjects={selectedProjectIds.length > 0}
                isSelected={selectedMessages.has(msg.id)}
                onToggleSelection={toggleMessageSelection}
                onAddToProject={handleAddToProjectSingle}
                onCopy={copyToClipboard}
                onRegenerate={regenerate}
              />
            ))}

            {isStreaming && (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-2xl border border-border bg-card px-5 py-3.5 text-sm text-card-foreground shadow-sm">
                  {streamingContent ? (
                    <>
                      <div className="mb-2 flex items-center gap-2">
                        <img src={`${basePath}/logo.svg`} alt="Aria" className="h-5 w-5 animate-pulse" />
                        <span className="text-xs font-medium text-primary">Aria is typing...</span>
                      </div>
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:border prose-pre:border-border prose-pre:bg-muted">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight, rehypeSanitize]}>
                          {streamingContent}
                        </ReactMarkdown>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-3">
                      <img src={`${basePath}/logo.svg`} alt="Aria" className="h-5 w-5 animate-pulse" />
                      <RotatingStatus className="text-primary text-xs font-medium" />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="h-36" />
          </div>
        )}
      </div>

      {showScrollBtn && conversationId && (
        <Button
          size="icon"
          onClick={() => {
            atBottomRef.current = true;
            scrollToBottom(true);
            setShowScrollBtn(false);
          }}
          className="absolute bottom-32 right-6 z-20 h-9 w-9 rounded-full border border-border bg-card text-foreground shadow-lg hover:bg-accent"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      )}

      {selectedProjectIds.length > 0 && selectedMessages.size > 0 && (
        <div className="absolute bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-primary/40 bg-primary px-4 py-3 text-primary-foreground shadow-2xl">
          <span className="text-sm font-medium">{selectedMessages.size} selected</span>
          <Select value={targetProjectId} onValueChange={setTargetProjectId}>
            <SelectTrigger className="h-8 w-[150px] border-primary-foreground/30 bg-primary-foreground/10 text-xs text-primary-foreground">
              <SelectValue placeholder="Target project" />
            </SelectTrigger>
            <SelectContent>
              {projectList?.filter((p) => p.isActive).map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="rounded-full bg-background text-foreground hover:bg-background/90" onClick={handleAddToProject} disabled={!targetProjectId}>
            Add
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full hover:bg-primary-foreground/15" onClick={() => setSelectedMessages(new Set())}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {conversationId && (
        <div className="shrink-0 border-t border-border bg-background px-3 py-3 md:px-4 md:py-4">
          {renderInput()}
        </div>
      )}
    </div>
  );
}
