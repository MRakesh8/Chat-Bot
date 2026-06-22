import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListGeminiConversationsQueryKey,
  getListGeminiMessagesQueryKey,
  getGetGeminiConversationQueryKey,
} from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { apiUrl } from "@/lib/api-url";

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

  const sendMessage = async (conversationId: string, content: string, fileIds: string[], projectIds: string[] = [], useNormalAi: boolean = true, optimisticUserMessageId?: string) => {
    setIsStreaming(true);
    setStreamingContent("");
    let fullContent = "";

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const { data } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (data.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }

      const response = await fetch(apiUrl(`/api/gemini/conversations/${conversationId}/messages`), {
        method: "POST",
        headers,
        body: JSON.stringify({ content, fileIds, projectIds, useNormalAi }),
        credentials: "include",
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const json = await response.json();
        if (json.error) throw new Error(json.error);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      }

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
                // Optimistically write final messages to prevent layout flash before refetch
                const userMsg = {
                  id: optimisticUserMessageId || "optimistic-user-" + Date.now(),
                  role: "user",
                  content: content,
                  createdAt: new Date().toISOString(),
                };
                const assistantMsg = {
                  id: "optimistic-assistant-" + Date.now(),
                  role: "assistant",
                  content: fullContent,
                  createdAt: new Date().toISOString(),
                };
                queryClient.setQueryData(getListGeminiMessagesQueryKey(conversationId), (old: any) => {
                  if (!old) return [userMsg, assistantMsg];
                  const existingUserMsg = old.find((m: any) => m.id === userMsg.id);
                  const filtered = old.filter((m: any) => 
                    m.id !== userMsg.id && !m.id.toString().startsWith("optimistic-")
                  );
                  return [...filtered, existingUserMsg || userMsg, assistantMsg];
                });

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
                fullContent += json.content;
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
      console.log("FRONTEND_ERROR_RECEIVED");
      setIsStreaming(false);
      console.log("UI_LOADING_CLEARED");
      setStreamingContent("");
      abortControllerRef.current = null;
      
      queryClient.setQueryData(getListGeminiMessagesQueryKey(conversationId), (old: any) => {
        const errorMsg = {
          id: "error-" + Date.now(),
          sender: "ai",
          content: "AI service temporarily unavailable. Please try again later.",
          createdAt: new Date().toISOString(),
          isError: true
        };
        if (!old) return [errorMsg];
        return [...old, errorMsg];
      });

      await queryClient.invalidateQueries({
        queryKey: getListGeminiMessagesQueryKey(conversationId),
      });
    }
  };

  return { sendMessage, isStreaming, streamingContent, stopStreaming };
}
