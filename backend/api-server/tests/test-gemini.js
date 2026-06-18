/**
 * @file test-gemini.js
 * @description Test script to verify connection to the Gemini API endpoint directly using standard fetch and the environment API key.
 */
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Error: GEMINI_API_KEY environment variable is not set.");
  process.exit(1);
}

fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }] })
}).then(async res => {
  console.log(res.status, await res.text());
}).catch(console.error);
