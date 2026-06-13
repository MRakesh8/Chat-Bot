
async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/gemini/conversations/test-id/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: "hi",
        useNormalAi: true,
        projectIds: [],
        fileIds: []
      })
    });
    
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
  } catch (err) {
    console.error(err);
  }
}

test();
