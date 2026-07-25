// test-agent.js
async function run() {
  const widgetToken = "2ca32dba01a94b00f29c3aabe5c9e7e54213e461b4fc08482e796ccd9fc8c24b";
  const url = `https://chat-bot-api-ns81.onrender.com/api/widget/${widgetToken}/chat`;
  
  // Fake website context mimicking test-website.html
  const context = {
    version: "1.0.0",
    extractedAt: Date.now(),
    url: "file:///test-website.html",
    state: { isScrolling: false, documentReady: true },
    segments: {
      "main-view": {
        data: {
          forms: [{
            id: "profile-form",
            selector: "#profile-form",
            fields: [
              { id: "username", selector: "#username", type: "text", label: "Username" },
              { id: "email", selector: "#email", type: "email", label: "Email" }
            ],
            buttons: [
              { id: "save-btn", selector: "#save-btn", text: "Save Profile" }
            ]
          }],
          buttons: [
            { id: "save-btn", selector: "#save-btn", text: "Save Profile" },
            { id: "upgrade-btn", selector: "#upgrade-btn", text: "Upgrade to Pro" }
          ]
        },
        priority: 10
      }
    }
  };

  const body = {
    messages: [
      { role: "user", content: "Can you click the Upgrade to Pro button for me?" }
    ],
    websiteContext: context,
    sessionId: "test-session-123"
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    console.log("Status:", res.status);
    
    // Read the stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      console.log("Stream Chunk:\n", chunk);
    }
  } catch(e) {
    console.error(e);
  }
}

run();
