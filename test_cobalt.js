const url = "https://api.cobalt.tools/api/json";
fetch(url, {
  method: "POST",
  headers: {
    "Accept": "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ url: "https://www.instagram.com/reel/CzB2vN5rXyE/" })
}).then(res => res.json()).then(console.log).catch(console.error);
