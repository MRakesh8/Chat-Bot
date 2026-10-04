import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
import { GoogleGenAI } from "@google/genai";

async function test() {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: { baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL?.replace(/\/v1beta\/?$/, '') }
  });
  
  const res = await client.models.embedContent({
    model: "gemini-embedding-001",
    contents: "Hello world",
    config: { outputDimensionality: 768 }
  });
  console.log("Vector dimensions with outputDimensionality 768:", res.embeddings?.[0]?.values?.length);
}

test();
