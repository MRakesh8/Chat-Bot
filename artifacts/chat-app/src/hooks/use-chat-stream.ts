import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListGeminiConversationsQueryKey,
  getListGeminiMessagesQueryKey,
  getGetGeminiConversationQueryKey,
} from "@workspace/api-client-react";

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setStreamingContent("");
  };

  const sendMessage = async (conversationId: number, content: string, fileIds: number[]) => {
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
    setIsStreaming(true);
    setStreamingContent("");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${basePath}/api/gemini/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, fileIds }),
        credentials: "include",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
                setStreamingContent("");
                setIsStreaming(false);
                abortControllerRef.current = null;
                await queryClient.invalidateQueries({
                  queryKey: getListGeminiMessagesQueryKey(conversationId),
                });
                await queryClient.invalidateQueries({
                  queryKey: getGetGeminiConversationQueryKey(conversationId),
                });
                await queryClient.invalidateQueries({
                  queryKey: getListGeminiConversationsQueryKey(),
                });
              } else if (json.content) {
                setStreamingContent((prev) => prev + json.content);
              } else if (json.error) {
                throw new Error(json.error);
              }
            } catch (e: unknown) {
              if (e instanceof SyntaxError) {
                console.error("Failed to parse SSE JSON", e);
              } else {
                throw e;
              }
            }
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error streaming message:", error);
      setIsStreaming(false);
      setStreamingContent("");
      abortControllerRef.current = null;
      await queryClient.invalidateQueries({
        queryKey: getListGeminiMessagesQueryKey(conversationId),
      });
    }
  };

  return { sendMessage, isStreaming, streamingContent, stopStreaming };
}
