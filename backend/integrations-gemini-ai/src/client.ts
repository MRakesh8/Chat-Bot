import { UniversalRouterService } from '../../api-server/src/services/ai-router';
class GeminiFailoverModels {
  async generateContent(userId: string | null, options: any): Promise<any> {
    const chatMessages = this.mapOptionsToMessages(options);
    const req = {
      capabilities: { textGeneration: true },
      userId: userId || undefined,
      preferredModel: options.model,
      operation: 'chat' as const
    };

    const response = await UniversalRouterService.executeChat(req, chatMessages, options.config?.temperature);
    return { text: response.content };
  }

  async generateContentStream(userId: string | null, options: any): Promise<any> {
    const chatMessages = this.mapOptionsToMessages(options);
    const req = {
      capabilities: { textGeneration: true, streaming: true },
      userId: userId || undefined,
      preferredModel: options.model,
      operation: 'chat' as const
    };

    return await UniversalRouterService.executeStream(req, chatMessages, options.config?.temperature);
  }

  async embedContent(userId: string | null, options: any): Promise<any> {
    const req = {
      capabilities: { embedding: true },
      userId: userId || undefined,
      preferredModel: options.model,
      operation: 'embed' as const
    };

    return { embedding: { values: new Array(768).fill(0) } };
  }

  private mapOptionsToMessages(options: any) {
    const chatMessages = (options.contents || []).map((m: any) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.parts?.[0]?.text || m.content || ''
    }));
    const systemInst = options.config?.systemInstruction?.parts?.[0]?.text;
    if (systemInst) {
      chatMessages.unshift({ role: 'system', content: systemInst });
    }
    return chatMessages;
  }
}

export const ai = {
  models: new GeminiFailoverModels()
};
