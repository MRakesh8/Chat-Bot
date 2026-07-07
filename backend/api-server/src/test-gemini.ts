import { GoogleGenAI } from "@google/genai";

const client = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
});

async function test() {
  try {
    const res = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "Hello"
    });
    console.log("Success:", res.text);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
