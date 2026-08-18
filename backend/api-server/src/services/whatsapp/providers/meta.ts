import { NormalizedWhatsAppMessage, SendMessageParams, WhatsAppProvider } from "../provider";
import { logger } from "../../../lib/logger";

export class MetaBusinessProvider implements WhatsAppProvider {
  name = "meta";

  async validateWebhook(req: any, credentials?: any): Promise<boolean> {
    // Verification logic for Meta webhook (usually done via GET params hook challenge during setup)
    // We only care about the POST events here. Validation is usually a verify_token.
    // Meta uses app secret proof or just relies on the url token if we implemented it that way.
    return true; 
  }

  async parseWebhook(payload: any, connectionId: string, projectId: string): Promise<NormalizedWhatsAppMessage[]> {
    const messages: NormalizedWhatsAppMessage[] = [];
    
    // Meta webhook payload format
    if (payload.object === "whatsapp_business_account" && payload.entry) {
      for (const entry of payload.entry) {
        const accountId = entry.id;
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.value && change.value.messages) {
              const metadata = change.value.metadata;
              const displayPhoneNumber = metadata?.display_phone_number;
              const phoneNumberId = metadata?.phone_number_id;
              
              for (const msg of change.value.messages) {
                // Get contact info
                const contact = change.value.contacts?.find((c: any) => c.wa_id === msg.from);
                const customerName = contact?.profile?.name || "";
                
                // For now, only handle text messages or extract text from others if possible
                let text = "";
                if (msg.type === "text") {
                  text = msg.text?.body || "";
                } else if (msg.type === "button") {
                  text = msg.button?.text || "";
                } else if (msg.type === "interactive") {
                  text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "";
                }

                messages.push({
                  channel: "whatsapp",
                  provider: this.name,
                  providerAccountId: phoneNumberId, // we map using phone_number_id
                  projectId,
                  connectionId,
                  providerChatId: msg.from, // the user's phone number acts as the chat ID in Meta
                  providerMessageId: msg.id,
                  customerIdentifier: msg.from,
                  customerName,
                  text,
                  timestamp: msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date(),
                  metadata: { ...msg, displayPhoneNumber }
                });
              }
            }
          }
        }
      }
    }
    
    return messages;
  }

  async sendMessage(params: SendMessageParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { providerChatId, text, credentials } = params;
      const accessToken = credentials?.accessToken;
      const phoneNumberId = credentials?.phoneNumberId;
      
      if (!accessToken || !phoneNumberId) throw new Error("Missing Meta credentials");

      // Official Meta Graph API
      const version = "v21.0"; // Use a recent Graph API version
      const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: providerChatId,
          type: "text",
          text: {
            preview_url: false,
            body: text
          }
        })
      });

      const data: any = await response.json();
      
      if (!response.ok) {
        return { success: false, error: `Meta API Error: ${data?.error?.message || response.statusText}` };
      }

      const messageId = data.messages && data.messages.length > 0 ? data.messages[0].id : "";
      return { success: true, messageId };

    } catch (err: any) {
      logger.error({ err }, "Failed to send message via Meta");
      return { success: false, error: err.message || "Unknown error" };
    }
  }

  async getConnectionStatus(credentials: any): Promise<{ connected: boolean; info?: any }> {
    try {
      const accessToken = credentials?.accessToken;
      const phoneNumberId = credentials?.phoneNumberId;
      if (!accessToken || !phoneNumberId) return { connected: false };
      
      const version = "v21.0";
      const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}`, {
        headers: {
          "Authorization": `Bearer ${accessToken}`
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
