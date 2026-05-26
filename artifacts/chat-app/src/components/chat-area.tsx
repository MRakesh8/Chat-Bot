import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useGetGeminiConversation, useListGeminiMessages, getGetGeminiConversationQueryKey, getListGeminiMessagesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStream } from "@/hooks/use-chat-stream";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, StopCircle, Mic, Paperclip, Copy, RotateCcw, X, Loader2, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export function ChatArea() {
  const { id } = useParams();
  const conversationId = id ? parseInt(id, 10) : undefined;

  const { data: conversation } = useGetGeminiConversation(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getGetGeminiConversationQueryKey(conversationId!) }
  });

  const { data: messages } = useListGeminiMessages(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getListGeminiMessagesQueryKey(conversationId!) }
  });

  const { sendMessage, isStreaming, streamingContent, stopStreaming } = useChatStream();
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [files, setFiles] = useState<{ file: File; id?: number; uploading: boolean }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const { toast } = useToast();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const queryClient = useQueryClient();

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

  // Auto-scroll only when user is already near the bottom
  useEffect(() => {
    if (atBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, streamingContent, scrollToBottom]);

  // Scroll to bottom when switching conversations
  useEffect(() => {
    atBottomRef.current = true;
    setShowScrollBtn(false);
    scrollToBottom();
  }, [conversationId, scrollToBottom]);

  const handleSend = () => {
    if ((!input.trim() && files.length === 0) || !conversationId) return;
    const fileIds = files.filter(f => f.id).map(f => f.id!);
    sendMessage(conversationId, input, fileIds);
    setInput("");
    setFiles([]);
    // Always scroll to bottom when user sends
    atBottomRef.current = true;
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
    if (SpeechRecognition) {
      setIsRecording(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      let finalTranscript = "";
      recognition.onresult = (e: any) => {
        let interimTranscript = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
          else interimTranscript += e.results[i][0].transcript;
        }
        setInput(finalTranscript + interimTranscript);
      };
      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);
      recognition.start();
    } else {
      toast({ title: "Not Supported", description: "Voice input is not supported in this browser." });
    }
  };

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    if (conversationId) formData.append("conversationId", String(conversationId));
    try {
      const res = await fetch(`${basePath}/api/files/upload`, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      return await res.json();
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const selectedFiles = Array.from(e.target.files);
    for (const file of selectedFiles) {
      setFiles(prev => [...prev, { file, uploading: true }]);
      const res = await uploadFile(file);
      if (res && res.id) {
        setFiles(prev => prev.map(f => f.file === file ? { ...f, id: res.id, uploading: false } : f));
      } else {
        toast({ title: "Upload Failed", description: `Failed to upload ${file.name}` });
        setFiles(prev => prev.filter(f => f.file !== file));
      }
    }
    e.target.value = "";
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Message copied to clipboard." });
  };

  const regenerate = () => {
    if (!conversationId || !messages?.length) return;
    const lastUser = [...(messages ?? [])].reverse().find(m => m.role === "user");
    if (lastUser) sendMessage(conversationId, lastUser.content, []);
  };

  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background p-4">
        <div className="text-center max-w-md w-full">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_-5px_rgba(124,58,237,0.3)]">
            <img src={`${basePath}/logo.svg`} alt="Aria AI" className="w-8 h-8 opacity-80" />
          </div>
          <h2 className="text-3xl font-semibold text-white mb-3">What can I help you with?</h2>
          <p className="text-zinc-400 mb-8">Select a conversation or start a new one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background min-h-0 h-full relative">
      {/* Header */}
      <div className="h-14 border-b border-white/5 flex items-center justify-center md:justify-start px-12 md:px-4 bg-background/80 backdrop-blur-md flex-shrink-0 z-10">
        <h1 className="font-medium text-white truncate max-w-[200px] md:max-w-md">{conversation?.title || "Chat"}</h1>
      </div>

      {/* Messages — scrollable area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-4"
      >
        <div className="max-w-3xl mx-auto space-y-6">
          {messages?.map((msg) => (
            <div
              key={msg.id}
              className={cn("flex group", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              <div className={cn(
                "max-w-[85%] rounded-2xl px-5 py-3.5",
                msg.role === "user"
                  ? "bg-white/10 text-white"
                  : "bg-transparent text-zinc-300 border border-white/5"
              )}>
                {msg.role !== "user" && (
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <img src={`${basePath}/logo.svg`} alt="Aria" className="w-5 h-5" />
                      <span className="text-xs font-medium text-zinc-500">Aria</span>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => copyToClipboard(msg.content)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={regenerate}>
                        <RotateCcw className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
                <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 max-w-none text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}

          {isStreaming && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl px-5 py-3.5 bg-transparent text-zinc-300 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <img src={`${basePath}/logo.svg`} alt="Aria" className="w-5 h-5 animate-pulse" />
                  <span className="text-xs font-medium text-primary animate-pulse">Aria is typing…</span>
                </div>
                {streamingContent ? (
                  <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 max-w-none text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                      {streamingContent}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex gap-1 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bottom padding so last message isn't hidden under the input */}
          <div className="h-36" />
        </div>
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <div className="absolute bottom-32 right-6 z-20">
          <Button
            size="icon"
            onClick={() => { atBottomRef.current = true; scrollToBottom(true); setShowScrollBtn(false); }}
            className="h-8 w-8 rounded-full bg-zinc-800 border border-white/10 text-zinc-300 hover:bg-zinc-700 shadow-lg"
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Input bar — normal flow, not absolute */}
      <div className="flex-shrink-0 p-3 md:p-4 border-t border-white/5 bg-background">
        <div className="max-w-3xl mx-auto">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1 text-xs text-white">
                  <span className="truncate max-w-[120px]">{f.file.name}</span>
                  {f.uploading
                    ? <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                    : (
                      <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-400 flex-shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                </div>
              ))}
            </div>
          )}
          <div className="relative bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl focus-within:ring-1 focus-within:ring-primary/50 transition-all">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Aria…"
              className="w-full min-h-[52px] max-h-[180px] bg-transparent border-0 resize-none px-4 py-3.5 focus-visible:ring-0 text-white placeholder:text-zinc-500 text-sm"
              rows={1}
            />
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-1">
                <input type="file" id="file-upload" className="hidden" multiple onChange={handleFileChange} />
                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full"
                  title="Attach file (image, PDF, text…)"
                  onClick={() => document.getElementById("file-upload")?.click()}
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className={cn("h-8 w-8 rounded-full transition-colors", isRecording ? "text-red-500 bg-red-500/10 hover:bg-red-500/20" : "text-zinc-400 hover:text-white hover:bg-white/10")}
                  onClick={startVoiceInput}
                >
                  <Mic className="w-4 h-4" />
                </Button>
              </div>

              {isStreaming ? (
                <Button
                  size="icon"
                  onClick={stopStreaming}
                  className="h-8 w-8 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  <StopCircle className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() && files.length === 0}
                  size="icon"
                  className={cn(
                    "h-8 w-8 rounded-full transition-all",
                    (input.trim() || files.length > 0)
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500"
                      : "bg-white/5 text-zinc-500"
                  )}
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="text-center mt-2">
            <span className="text-[10px] text-zinc-600">Aria can make mistakes. Consider verifying important information.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
