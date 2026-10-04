const fs = require("fs");
const https = require("https");

const url = "https://pagalnew.com/category/bollywood-mp3-songs/2";
const output = "./song.mp3";

const file = fs.createWriteStream(output);

https.get(url, (response) => {
  if (response.statusCode !== 200) {
    file.close();
    fs.unlinkSync(output);
    throw new Error(`Download failed: HTTP ${response.statusCode}`);
  }

  response.pipe(file);

  file.on("finish", () => {
    file.close();
    console.log(`Downloaded: ${output}`);
  });
});