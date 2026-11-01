/** 把一個資料夾的圖排成對照表：node --import tsx eval/sheet.mts <dir> <out.jpg> [cols] */
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
const [dir, out, colsArg] = process.argv.slice(2);
const files = (await fs.readdir(dir)).filter((f) => !f.startsWith(".")).sort();
const cols = Number(colsArg ?? 8), tw = 300, th = 300;
const tiles = await Promise.all(files.map((f) => sharp(path.join(dir, f)).resize(tw, th, { fit: "contain", background: "#ddd" }).jpeg().toBuffer()));
await sharp({ create: { width: cols * tw, height: Math.ceil(files.length / cols) * th, channels: 3, background: "#222" } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * tw, top: Math.floor(i / cols) * th }))).jpeg({ quality: 80 }).toFile(out);
console.log(files.join(", "));
