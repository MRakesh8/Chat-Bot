import { ai } from "./dist/index.js";

async function verify() {
  console.log("=== Starting Verification ===");
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Hello",
    });
    console.log("Response:", res);
  } catch (err) {
    console.error("Verification caught error:", err);
  }
}

verify();
