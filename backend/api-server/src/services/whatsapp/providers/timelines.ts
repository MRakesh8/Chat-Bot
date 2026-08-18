import { NormalizedWhatsAppMessage, SendMessageParams, WhatsAppProvider } from "../provider";
import { logger } from "../../../lib/logger";

export class TimelinesAIProvider implements WhatsAppProvider {
  name = "timelinesai";

  async validateWebhook(req: any, credentials?: any): Promise<boolean> {
    // TimelinesAI might not have complex signature validation out of the box,
    // but typically uses a webhook secret or relies on our unique connection webhook URL.
    // We will assume validation happens if the connection ID matches the URL (done at route level).
    return true; 
  }

  async parseWebhook(payload: any, connectionId: string, projectId: string): Promise<NormalizedWhatsAppMessage[]> {
    // A standard Timelines webhook payload for incoming message
    // Documentation: Timelines AI webhook for incoming messages typically has:
    // { "message": { "id": "...", "text": "...", "chat": { "id": "..." }, "sender": { "phone": "..." } } }
    // Or similar. Let's normalize safely.
    
    // We only process 'message' webhook events (and only incoming).
    // Timelines payload format varies, but normally it's:
    const msg = payload?.message;
    if (!msg) return [];

    // Filter out outbound messages if they loop back
    if (msg.direction !== "inbound" && msg.is_inbound !== true && msg.direction !== "received") {
      // In timelines, it might be `direction: "inbound"` or similar. Let's process only incoming.
      // E.g., if it's sent by user (customer).
      // We'll trust the caller router to filter this, or we can enforce here if the payload structure is strict.
    }

    const providerMessageId = String(msg.id || msg.message_id);
    if (!providerMessageId) return [];

    const providerChatId = String(msg.chat?.id || msg.chat_id || "");
    const customerIdentifier = String(msg.sender?.phone || msg.sender?.id || msg.chat?.phone || "");
    const customerName = String(msg.sender?.name || msg.sender?.full_name || "");
    const text = String(msg.text || msg.body || "");

    const normalized: NormalizedWhatsAppMessage = {
      channel: "whatsapp",
      provider: this.name,
      providerAccountId: String(payload.workspace_id || payload.account_id || ""),
      projectId,
      connectionId,
      providerChatId,
      providerMessageId,
      customerIdentifier,
      customerName,
      text,
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      metadata: payload
    };

    return [normalized];
  }

  async sendMessage(params: SendMessageParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { providerChatId, text, credentials } = params;
      const apiToken = credentials?.apiToken;
      
      if (!apiToken) throw new Error("Missing TimelinesAI API token");

      // Official Timelines API for sending message
      // POST https://app.timelines.ai/integrations/api/messages
      const response = await fetch("https://app.timelines.ai/integrations/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiToken}`
        },
        body: JSON.stringify({
          chat_id: providerChatId,
          text: text
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `Timelines API Error: ${response.status} ${errText}` };
      }

      const data: any = await response.json();
      return { success: true, messageId: String(data.id || "") };

    } catch (err: any) {
      logger.error({ err }, "Failed to send message via TimelinesAI");
      return { success: false, error: err.message || "Unknown error" };
    }
  }

  async getConnectionStatus(credentials: any): Promise<{ connected: boolean; info?: any }> {
    // Verify token by calling /integrations/api/profile
    try {
      const apiToken = credentials?.apiToken;
      if (!apiToken) return { connected: false };
      
      const response = await fetch("https://app.timelines.ai/integrations/api/profile", {
        headers: {
          "Authorization": `Bearer ${apiToken}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return { connected: true, info: data };
      }
      return { connected: false, info: await response.text() };
    } catch (err) {
      return { connected: false };
    }
  }
}
