import { ChatArea } from "@/components/chat-area";
import { ErrorBoundary } from "@/components/error-boundary";

export default function ChatPage() {
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
