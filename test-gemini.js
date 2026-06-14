fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=REDACTED_KEY", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }] })
}).then(async res => {
  console.log(res.status, await res.text());
}).catch(console.error);
