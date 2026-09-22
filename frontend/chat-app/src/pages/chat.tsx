import { ChatArea } from "@/components/chat-area";
import { ErrorBoundary } from "@/components/error-boundary";
import { useSEO } from "@/hooks/use-seo";

export default function ChatPage() {
  useSEO({
    title: "Chat — NOVA Business AI",
    description: "Start a conversation with NOVA AI, your intelligent business assistant supporting multiple AI providers.",
    keywords: "AI chat, AI assistant, NOVA AI, business chatbot, conversational AI",
    canonicalPath: "/chat"
  });

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <div className="flex-1 relative flex overflow-hidden">
        <ErrorBoundary>
          <ChatArea />
        </ErrorBoundary>
      </div>
    </div>
  );
}
