async function test() {
  const url = "https://www.instagram.com/reel/C8qLz-Xv24A/";
  const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}&video=true`);
  console.log(await res.json());
}
test();
