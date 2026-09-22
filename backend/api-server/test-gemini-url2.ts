import { GoogleGenAI } from "@google/genai";
const client = new GoogleGenAI({ 
    apiKey: "dummy-key", 
    httpOptions: { baseUrl: "https://generativelanguage.googleapis.com", apiVersion: "" } 
});
async function run() {
    try {
        await client.models.generateContent({
            model: "gemini-2.0-flash",
            contents: "hello"
        });
    } catch(e: any) {
        console.log("Error status:", e.status);
    }
}
run();
