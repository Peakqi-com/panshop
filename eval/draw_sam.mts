/** 把 SAM 原始輸出畫回影格，檢查追蹤品質：node --import tsx eval/draw_sam.mts <raw.txt> <video> <out.jpg> [frames...] */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { samParser } from "../src/lib/sam-parser";
import { frameAt, tmpDir, transcodeLowFps } from "../src/lib/ffmpeg";

const [rawPath, video, out, ...fr] = process.argv.slice(2);
const frames = fr.length ? fr.map(Number) : [10, 40, 80, 120, 200, 260, 300, 320];
const { parseVideoStream, recordsOfKind } = await samParser();
const raw = await fs.readFile(rawPath, "utf8");
async function* events() {
  yield { type: "response.output_text.delta", delta: raw, item_id: "x", output_index: 0, content_index: 0 } as const;
  yield { type: "response.output_text.done", text: raw, item_id: "x", output_index: 0, content_index: 0 } as const;
  yield { type: "response.completed" } as const;
}
const parsed = parseVideoStream(events());
for await (const _ of parsed) { /* */ }
const res = await parsed.finalResult;
const boxes = recordsOfKind(res.records, "box");
const dir = await tmpDir();
const low = await transcodeLowFps(video, path.join(dir, "low.mp4"), 4, 720);
const colors = ["#ff3b30", "#34c759", "#007aff", "#ff9500", "#af52de", "#5ac8fa", "#ffcc00", "#ff2d55"];
const TW = 640, TH = 360, cols = 2;
const sheet = createCanvas(cols * TW, Math.ceil(frames.length / cols) * TH);
const sx = sheet.getContext("2d");
for (const [i, f] of frames.entries()) {
  const img = path.join(dir, `f${f}.png`);
  await frameAt(low, f / 4 + 0.001, img, 720);
  const im = await loadImage(img);
  const c = createCanvas(im.width, im.height);
  const x = c.getContext("2d");
  x.drawImage(im, 0, 0);
  x.lineWidth = 6; x.font = "bold 30px Helvetica";
  for (const b of boxes.filter((b) => b.frame?.frameIndex === f)) {
    const col = colors[Number(b.objectId) % colors.length];
    x.strokeStyle = col; x.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
    x.fillStyle = col; x.fillRect(b.left, Math.max(0, b.top - 40), 150, 40);
    x.fillStyle = "white"; x.fillText(`#${b.objectId} ${b.confidence?.toFixed(2) ?? ""}`, b.left + 8, Math.max(0, b.top - 40) + 30);
  }
  x.fillStyle = "black"; x.fillRect(0, im.height - 36, 160, 36);
  x.fillStyle = "white"; x.font = "26px Helvetica"; x.fillText(`f${f} t${(f / 4).toFixed(1)}`, 8, im.height - 10);
  sx.drawImage(c, (i % cols) * TW, Math.floor(i / cols) * TH, TW, TH);
}
await fs.writeFile(out, sheet.toBuffer("image/jpeg", 80));
console.log("wrote", out, `${boxes.length} boxes`);
await fs.rm(dir, { recursive: true, force: true });
