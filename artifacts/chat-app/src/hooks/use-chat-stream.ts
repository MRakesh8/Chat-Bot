import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListGeminiMessagesQueryKey } from "@workspace/api-client-react";

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const queryClient = useQueryClient();

  const sendMessage = async (conversationId: number, content: string, fileIds: number[]) => {
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
    setIsStreaming(true);
    setStreamingContent("");
    
    try {
      const response = await fetch(`${basePath}/api/gemini/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, fileIds }),
        credentials: "include",
      });
      
      if (!response.body) throw new Error("No response body");
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      
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
                setIsStreaming(false);
                queryClient.invalidateQueries({ queryKey: getListGeminiMessagesQueryKey(conversationId) });
              } else {
                full += json.content;
                setStreamingContent(full);
              }
            } catch (e) {
              console.error("Failed to parse SSE JSON", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error streaming message:", error);
      setIsStreaming(false);
    }
  };

  return { sendMessage, isStreaming, streamingContent };
}
