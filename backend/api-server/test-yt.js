import youtubedl from 'youtube-dl-exec';

async function test() {
  try {
    const res = await youtubedl("https://www.instagram.com/reel/C8qLz-Xv24A/", {
      dumpJson: true,
      noWarnings: true,
    });
    console.log(res);
  } catch(e) {
    console.error(e);
  }
}
test();
