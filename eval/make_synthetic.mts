/**
 * 合成測試影片：8 件商品（3 品類）用 Muse Image 生成、排成一列，鏡頭左→右再回頭掃，
 * 並用 macOS say 合成口述（品名與價格）。件數與品名就是標準答案，寫到 eval/labels/synthetic.json。
 *   node --env-file=.env.local --import tsx eval/make_synthetic.mts          # 完整 8 件、80 秒
 *   node --env-file=.env.local --import tsx eval/make_synthetic.mts --quick  # 快速 3 件、約 25 秒（日常測試用）
 *   node --env-file=.env.local --import tsx eval/make_synthetic.mts --quick --en  # 同 3 件，英文口述、美元價格
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { imageGenerate } from "../src/lib/meta";
import { ffmpegPath } from "../src/lib/ffmpeg";

const x = promisify(execFile);
const OUT = path.join("eval", "footage");
const ITEMS = [
  { code: "A1", category: "馬克杯", phrase: "mug", title: "霧面白色陶瓷馬克杯", price: 380, prompt: "matte white ceramic coffee mug", en: { title: "matte white ceramic mug", price: 12, say: "twelve dollars" } },
  { code: "A2", category: "馬克杯", phrase: "mug", title: "深藍色琺瑯馬克杯", price: 420, prompt: "navy blue enamel camping mug with white rim" },
  { code: "A3", category: "馬克杯", phrase: "mug", title: "黃色條紋玻璃馬克杯", price: 350, prompt: "clear glass mug with yellow horizontal stripes" },
  { code: "B1", category: "書", phrase: "book", title: "綠色精裝筆記本", price: 290, prompt: "green hardcover notebook with elastic band", en: { title: "green hardcover notebook", price: 9.5, say: "nine fifty" } },
  { code: "B2", category: "書", phrase: "book", title: "橘色封面平裝書", price: 320, prompt: "orange paperback book with plain cover" },
  { code: "B3", category: "書", phrase: "book", title: "黑色皮革日誌本", price: 680, prompt: "black leather journal with gold edges" },
  { code: "C1", category: "運動鞋", phrase: "sneaker", title: "白色帆布休閒鞋", price: 1280, prompt: "single white canvas low-top sneaker" },
  { code: "C2", category: "運動鞋", phrase: "sneaker", title: "紅色慢跑鞋", price: 1980, prompt: "single red mesh running shoe", en: { title: "red running shoe", price: 64, say: "sixty-four dollars" } },
];
const QUICK = process.argv.includes("--quick");
const PICK = QUICK ? ITEMS.filter((i) => ["A1", "B1", "C2"].includes(i.code)) : ITEMS;
const TILE = 1080, W = 1920, H = 1080, FPS = 30, SPEED = 150; // px/s
const EN = process.argv.includes("--en");
if (EN && !QUICK) throw new Error("--en 目前只支援 --quick");
const NAME = (QUICK ? "quick" : "synthetic") + (EN ? "_en" : "");

await fs.mkdir(OUT, { recursive: true });
const tiles: string[] = [];
for (const it of PICK) {
  const f = path.join(OUT, `tile_${it.code}.png`);
  try { await fs.access(f); } catch {
    const { images } = await imageGenerate({ prompt: `Photo of a ${it.prompt} placed on a light oak wooden table, shot from a 30 degree angle, soft window light, realistic, product occupies the center, nothing else on the table`, size: "1024x1024", format: "png" });
    await sharp(images[0]).resize(TILE, TILE).png().toFile(f);
    console.log("generated", it.code);
  }
  tiles.push(f);
}
const strip = path.join(OUT, "strip.png");
const total = TILE * PICK.length;
await sharp({ create: { width: total, height: H, channels: 3, background: "#e9e2d6" } })
  .composite(tiles.map((t, i) => ({ input: t, left: i * TILE, top: 0 }))).png().toFile(strip);

// 鏡頭：從 x=0 掃到最右，再回頭掃回第 3 件，測出鏡再入鏡
const maxX = total - W;
const fwd = maxX / SPEED, back = (QUICK ? maxX : maxX - TILE * 1.5) / SPEED;
const dur = fwd + 1 + back + 1;
const xExpr = `if(lt(t,${fwd}),t*${SPEED},if(lt(t,${fwd + 1}),${maxX},if(lt(t,${fwd + 1 + back}),${maxX}-(t-${fwd + 1})*${SPEED},${maxX - back * SPEED})))`;

// 口述：每件商品在畫面中央時說品名與價格
const clips: string[] = [];
const delays: number[] = [];
for (const [i, it] of PICK.entries()) {
  const center = i * TILE + TILE / 2 - W / 2; // 讓該件在畫面中央的 x
  const t = Math.max(0.3, Math.min(center, maxX) / SPEED);
  const aiff = path.join(OUT, `say_${it.code}${EN ? "_en" : ""}.aiff`);
  const line = EN && "en" in it && it.en ? ["-v", "Samantha", "-r", "175", "-o", aiff, `This ${it.en.title}, ${it.en.say}.`] : ["-v", "Meijia", "-r", "170", "-o", aiff, `這個${it.title}，${it.price}元。`];
  await x("say", line);
  clips.push(aiff); delays.push(Math.round(t * 1000));
}
const inputs = ["-loop", "1", "-framerate", String(FPS), "-i", strip, ...clips.flatMap((c) => ["-i", c])];
const afilters = clips.map((_, i) => `[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=mono,adelay=${delays[i]}|${delays[i]}[a${i}]`).join(";");
const amix = clips.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${clips.length}:normalize=0,apad[a]`;
const video = path.join(OUT, `${NAME}.mp4`);
await x(ffmpegPath(), [...inputs, "-filter_complex", `[0:v]crop=${W}:${H}:'${xExpr}':0,format=yuv420p[v];${afilters};${amix}`, "-map", "[v]", "-map", "[a]", "-t", dur.toFixed(2), "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "128k", "-shortest", "-y", video], { maxBuffer: 1 << 26 });
await fs.writeFile(path.join("eval", "labels", `${NAME}.json`), JSON.stringify({ video: `eval/footage/${NAME}.mp4`, durationSec: Number(dur.toFixed(1)), items: PICK.map((it) => EN && "en" in it && it.en ? { code: it.code, category: it.phrase, phrase: it.phrase, title: it.en.title, price: it.en.price } : { code: it.code, category: it.category, phrase: it.phrase, title: it.title, price: it.price }) }, null, 2));
console.log("ok", video, `${dur.toFixed(1)}s`);
