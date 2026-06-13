import { ChatArea } from "@/components/chat-area";

export default function ChatPage() {
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <div className="flex-1 relative flex overflow-hidden">
        <ChatArea />
      </div>
    </div>
  );
}
