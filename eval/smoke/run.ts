/**
 * 模型煙霧測試。用法（金鑰從 .env.local 或 /admin）：
 *   node --env-file=.env.local --import tsx eval/smoke/run.ts spark
 *   node --env-file=.env.local --import tsx eval/smoke/run.ts voice <wav 或任何音訊檔>
 *   node --env-file=.env.local --import tsx eval/smoke/run.ts image
 *   node --env-file=.env.local --import tsx eval/smoke/run.ts sam-image <jpg> <phrase>
 *   node --env-file=.env.local --import tsx eval/smoke/run.ts sam-video <mp4> <phrase>
 *   node --env-file=.env.local --import tsx eval/smoke/run.ts baseten
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { recordsOfKind } from "@meta-sam/parser";
import { imageGenerate, samImage, samVideo, sparkJSON, transcribe, uploadFile } from "../../src/lib/meta";
import { sparkOpenChat } from "../../src/lib/baseten";
import { extractWav, probe, tmpDir, transcodeLowFps } from "../../src/lib/ffmpeg";

const [cmd, a1, a2] = process.argv.slice(2);
const out = path.join("eval", "smoke", "_out");
await fs.mkdir(out, { recursive: true });
const t0 = Date.now();

if (cmd === "spark") {
  const r = await sparkJSON({ schema: z.object({ items: z.array(z.object({ name: z.string(), color: z.string() })) }), name: "demo", parts: [{ text: "列出三樣常見的桌上商品與顏色，繁體中文。" }], effort: "low" });
  console.log(r.data, `$${r.usd.toFixed(5)}`);
} else if (cmd === "spark-image") {
  const b = await fs.readFile(a1);
  const r = await sparkJSON({ schema: z.object({ objects: z.array(z.string()) }), name: "objs", parts: [{ text: "列出圖中的物品（繁體中文）" }, { imageUrl: `data:image/jpeg;base64,${b.toString("base64")}` }] });
  console.log(r.data, `$${r.usd.toFixed(5)}`);
} else if (cmd === "voice") {
  const dir = await tmpDir();
  const wav = (await extractWav(a1, path.join(dir, "a.wav")))!;
  const r = await transcribe(await fs.readFile(wav), { languageBias: ["Chinese", "English"], keywords: ["馬克杯"] });
  console.log(JSON.stringify(r.result, null, 2).slice(0, 3000), `$${r.usd.toFixed(5)}`);
} else if (cmd === "image") {
  const r = await imageGenerate({ prompt: a1 ?? "studio product photo of a matte white ceramic mug on pure white background, soft shadow", size: "1024x1024" });
  await fs.writeFile(path.join(out, "image.png"), r.images[0]);
  console.log("saved eval/smoke/_out/image.png", `$${r.usd}`);
} else if (cmd === "sam-image") {
  const b = await fs.readFile(a1);
  const r = await samImage({ imageUrl: `data:image/jpeg;base64,${b.toString("base64")}`, phrase: a2 ?? "mug" });
  const boxes = recordsOfKind(r.result.records, "box");
  console.log(r.result.outcome, boxes.length, "boxes", boxes.slice(0, 5), "diag", r.result.diagnostics.slice(0, 3));
  await fs.writeFile(path.join(out, "sam-image.raw.txt"), r.result.rawOutput);
} else if (cmd === "sam-video") {
  const dir = await tmpDir();
  const p = await probe(a1);
  const low = await transcodeLowFps(a1, path.join(dir, "low.mp4"), 4, 720);
  const lp = await probe(low);
  console.log("src", p, "low", lp);
  const fileId = await uploadFile(await fs.readFile(low), "low.mp4", "video/mp4");
  console.log("file", fileId, `${Date.now() - t0}ms`);
  const r = await samVideo({ fileId, phrase: a2 ?? "mug", frames: Math.ceil(lp.durationSec * 4) });
  const boxes = recordsOfKind(r.result.records, "box");
  const masks = recordsOfKind(r.result.records, "mask");
  const ids = new Set(boxes.map((b) => b.objectId));
  console.log(r.result.outcome, `${boxes.length} boxes, ${masks.length} masks, ${ids.size} objects`, "diag", r.result.diagnostics.length, `$${r.usd.toFixed(3)}`);
  for (const id of ids) {
    const fr = boxes.filter((b) => b.objectId === id).map((b) => b.frame!.frameIndex);
    console.log(` obj ${id}: frames ${Math.min(...fr)}–${Math.max(...fr)} (${fr.length})`);
  }
  await fs.writeFile(path.join(out, "sam-video.raw.txt"), r.result.rawOutput);
} else if (cmd === "baseten") {
  const r = await sparkOpenChat({ user: "回答 JSON：{\"ok\":true,\"model\":\"你的名字\"}" });
  console.log(r);
} else {
  console.log("用法見檔頭");
}
console.log(`${Date.now() - t0}ms`);
