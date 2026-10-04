import { GoogleGenAI, Modality } from "@google/genai";

const rawApiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
const rawBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

export const ai = new GoogleGenAI({
  apiKey: rawApiKey,
  ...(rawBaseUrl ? {
    httpOptions: {
      baseUrl: rawBaseUrl.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '')
    }
  } : {})
});

export async function generateImage(
  prompt: string
): Promise<{ b64_json: string; mimeType: string }> {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  return {
    b64_json: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}
