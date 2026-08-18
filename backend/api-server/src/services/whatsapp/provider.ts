export interface NormalizedWhatsAppMessage {
  channel: "whatsapp";
  provider: string; // "timelinesai" or "meta"
  providerAccountId: string;
  projectId: string; // Resolves inside the processor
  connectionId: string;
  providerChatId: string;
  providerMessageId: string;
  customerIdentifier: string; // e.g. Phone number
  customerName?: string;
  text: string;
  timestamp: Date;
  metadata?: any;
}

export interface SendMessageParams {
  providerAccountId: string;
  providerChatId: string;
  customerIdentifier: string;
  text: string;
  credentials: any;
}

export interface WhatsAppProvider {
  /** Name of the provider */
  name: string;

  /** Validates the incoming webhook signature/auth */
  validateWebhook(req: any, credentials?: any): Promise<boolean>;

  /** Parses the webhook payload into normalized messages */
  parseWebhook(payload: any, connectionId: string, projectId: string): Promise<NormalizedWhatsAppMessage[]>;

  /** Sends a message to the customer */
  sendMessage(params: SendMessageParams): Promise<{ success: boolean; messageId?: string; error?: string }>;

  /** Optional: Gets current connection status from provider */
  getConnectionStatus?(credentials: any): Promise<{ connected: boolean; info?: any }>;
}
