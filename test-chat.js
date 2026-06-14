fetch("https://chat-bot-api-ns81.onrender.com/api/widget/2ca32dba01a94b00f29c3aabe5c9e7e54213e461b4fc08482e796ccd9fc8c24b/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
}).then(async res => {
  console.log("Status:", res.status);
  console.log("Body:", await res.text());
}).catch(console.error);
