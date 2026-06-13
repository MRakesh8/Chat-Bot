import { instagramGetUrl } from "instagram-url-direct";

async function test() {
  try {
    const res = await instagramGetUrl("https://www.instagram.com/reel/C-1vX-wP74a/");
    console.log(res);
  } catch(e) {
    console.error(e);
  }
}
test();
