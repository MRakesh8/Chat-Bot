import { GoogleGenAI } from "@google/genai";

class GeminiFailoverModels {
  private getClient(apiKey?: string) {
    const key = apiKey || process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
    const rawUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    const cleanUrl = rawUrl ? rawUrl.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '') : undefined;
    return new GoogleGenAI({
      apiKey: key,
      ...(cleanUrl ? { httpOptions: { baseUrl: cleanUrl } } : {})
    });
  }

  async generateContent(userId: string | null, options: any): Promise<any> {
    const client = this.getClient(options.apiKey);
    let model = options.model || "gemini-2.5-flash-lite";
    if (model === "gemini-2.0-flash" || model === "gemini-1.5-flash") {
      model = "gemini-2.5-flash-lite";
    }
    const contents = this.mapOptionsToContents(options);
    const config: any = {
      temperature: options.config?.temperature ?? 0.7,
      maxOutputTokens: options.config?.maxOutputTokens
    };
    if (options.config?.tools) config.tools = options.config.tools;
    if (options.config?.systemInstruction) config.systemInstruction = options.config.systemInstruction;
    if (options.config?.responseMimeType) config.responseMimeType = options.config.responseMimeType;

    try {
      const res = await client.models.generateContent({
        model,
        contents,
        config
      });
      return { text: res.text || "" };
    } catch (err: any) {
      // Automatic fallback to gemini-2.5-flash-lite if model was different and failed
      if (model !== "gemini-2.5-flash-lite") {
        const fallbackRes = await client.models.generateContent({
          model: "gemini-2.5-flash-lite",
          contents,
          config
        });
        return { text: fallbackRes.text || "" };
      }
      throw err;
    }
  }

  async generateContentStream(userId: string | null, options: any): Promise<any> {
    const client = this.getClient(options.apiKey);
    let model = options.model || "gemini-2.5-flash-lite";
    if (model === "gemini-2.0-flash" || model === "gemini-1.5-flash") {
      model = "gemini-2.5-flash-lite";
    }
    const contents = this.mapOptionsToContents(options);
    const config: any = {
      temperature: options.config?.temperature ?? 0.7,
      maxOutputTokens: options.config?.maxOutputTokens
    };
    if (options.config?.tools) config.tools = options.config.tools;
    if (options.config?.systemInstruction) config.systemInstruction = options.config.systemInstruction;

    try {
      return await client.models.generateContentStream({
        model,
        contents,
        config
      });
    } catch (err: any) {
      if (model !== "gemini-2.5-flash-lite") {
        return await client.models.generateContentStream({
          model: "gemini-2.5-flash-lite",
          contents,
          config
        });
      }
      throw err;
    }
  }

  async embedContent(userId: string | null, options: any): Promise<any> {
    const client = this.getClient(options.apiKey);
    const model = options.model === "text-embedding-004" ? "gemini-embedding-001" : (options.model || "gemini-embedding-001");
    const contents = options.contents || options.text || "";
    return await client.models.embedContent({
      model,
      contents,
      config: options.config || { outputDimensionality: 768 }
    });
  }

  private mapOptionsToContents(options: any) {
    if (options.contents) {
      if (typeof options.contents === "string") {
        return [{ role: "user", parts: [{ text: options.contents }] }];
      }
      if (Array.isArray(options.contents)) {
        return options.contents.map((item: any) => {
          if (typeof item === "string") return { role: "user", parts: [{ text: item }] };
          if (item.role && item.parts) return item;
          if (item.text) return { role: "user", parts: [{ text: item.text }] };
          if (item.inlineData) return { role: "user", parts: [{ inlineData: item.inlineData }] };
          return item;
        });
      }
      return options.contents;
    }
    if (options.prompt) {
      return [{ role: "user", parts: [{ text: options.prompt }] }];
    }
    return [{ role: "user", parts: [{ text: "" }] }];
  }
}

export const ai = {
  models: new GeminiFailoverModels()
};
