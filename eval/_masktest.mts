import { promises as fs } from "node:fs";
import sharp from "sharp";
import { samParser } from "/Users/change/developer/panshop/src/lib/sam-parser";
const { parseVideoStream, recordsOfKind, decodeMaskToRaster } = await samParser();
const raw = await fs.readFile("/Users/change/developer/panshop/eval/smoke/_out/sam-video.raw.txt", "utf8");
async function* ev() { yield { type: "response.output_text.delta", delta: raw, item_id: "x", output_index: 0, content_index: 0 } as const; yield { type: "response.output_text.done", text: raw, item_id: "x", output_index: 0, content_index: 0 } as const; yield { type: "response.completed" } as const; }
const p = parseVideoStream(ev()); for await (const _ of p) {} const r = await p.finalResult;
const masks = recordsOfKind(r.records, "mask").filter((m) => m.frame?.frameIndex === 40);
for (const m of masks) {
  const ras = decodeMaskToRaster(m.mask);
  const ones = ras.reduce((s, v) => s + v, 0);
  console.log("obj", m.objectId, "raster", m.mask.width, "x", m.mask.height, "len", ras.length, "ones", ones, "bounds", m.bounds, "enc", m.mask.encoding);
  const buf = Buffer.alloc(ras.length); for (let i = 0; i < ras.length; i++) buf[i] = ras[i] ? 255 : 0;
  await sharp(buf, { raw: { width: m.mask.width, height: m.mask.height, channels: 1 } }).png().toFile(`/Users/change/developer/panshop/eval/smoke/_out/mask_${m.objectId}.png`);
}
