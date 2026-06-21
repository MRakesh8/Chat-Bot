import { ChatArea } from "@/components/chat-area";
import { ErrorBoundary } from "@/components/error-boundary";
import { useSEO } from "@/hooks/use-seo";

export default function ChatPage() {
  useSEO({
    title: "Chat - Rakesh AI Chatbot",
    description: "Start a conversation with the Rakesh AI Chatbot, supporting OpenAI, Gemini AI, and multiple other AI providers.",
    keywords: "AI chat, AI assistant, OpenAI chatbot, Gemini chatbot, conversational AI",
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
