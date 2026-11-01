import sharp from "sharp";
const O = "eval/smoke/_out";
const files = ["A3_cutoutUrl.png", "A3_studioUrl.png", "A3_lifestyleUrl.png", "reel_1.jpg", "reel_5.jpg", "reel_11.jpg"];
const tiles = await Promise.all(files.map((f) => sharp(`${O}/${f}`).resize(360, 480, { fit: "contain", background: "#333" }).jpeg().toBuffer()));
await sharp({ create: { width: 360 * 6, height: 480, channels: 3, background: "#333" } }).composite(tiles.map((t, i) => ({ input: t, left: i * 360, top: 0 }))).jpeg({ quality: 80 }).toFile(`${O}/A3_sheet.jpg`);
console.log("sheet ok");
