import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { samParser } from "../src/lib/sam-parser";
import { frameAt, tmpDir, transcodeLowFps } from "../src/lib/ffmpeg";
const { parseVideoStream, recordsOfKind, decodeMaskToRaster } = await samParser();
const raw = await fs.readFile("eval/smoke/_out/sam-video.raw.txt", "utf8");
async function* ev() { yield { type: "response.output_text.delta", delta: raw, item_id: "x", output_index: 0, content_index: 0 } as const; yield { type: "response.output_text.done", text: raw, item_id: "x", output_index: 0, content_index: 0 } as const; yield { type: "response.completed" } as const; }
const p = parseVideoStream(ev()); for await (const _ of p) {} const r = await p.finalResult;
const m = recordsOfKind(r.records, "mask").find((m) => m.frame?.frameIndex === 40 && m.objectId === "3")!;
const dir = await tmpDir();
const low = await transcodeLowFps("eval/footage/synthetic.mp4", path.join(dir, "low.mp4"), 4, 720);
const frame = await frameAt(low, 10.001, path.join(dir, "f.png"), 1280);  // 與 segment 相同：maxShort = max(procW, procH)
const meta = await sharp(frame).metadata(); console.log("frame", meta.width, meta.height, meta.channels);
const W = meta.width!, H = meta.height!, sx = W / 1280, sy = H / 720;
const raster = decodeMaskToRaster(m.mask);
const rw = m.mask.width, rh = m.mask.height;
const left = Math.round(m.bounds.left * sx), top = Math.round(m.bounds.top * sy);
const width = Math.min(W - left, Math.round((m.bounds.right - m.bounds.left) * sx)), height = Math.min(H - top, Math.round((m.bounds.bottom - m.bounds.top) * sy));
const alphaRaw = Buffer.alloc(rw * rh); for (let i = 0; i < raster.length; i++) alphaRaw[i] = raster[i] ? 255 : 0;
const a = await sharp(alphaRaw, { raw: { width: rw, height: rh, channels: 1 } }).resize(width, height, { kernel: "nearest", fit: "fill" }).blur(0.6).raw().toBuffer({ resolveWithObject: true });
console.log("alpha", a.info, "expected", width * height);
const rgb = await sharp(frame).extract({ left, top, width, height }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
console.log("rgb", rgb.info);
const rgba = await sharp(rgb.data, { raw: { width, height, channels: 3 } }).joinChannel(a.data, { raw: { width, height, channels: 1 } }).png().toBuffer();
await sharp({ create: { width: width + 40, height: height + 40, channels: 3, background: "#ffffff" } }).composite([{ input: rgba, left: 20, top: 20 }]).png().toFile("eval/smoke/_out/cutout_test.png");
console.log("ok");
