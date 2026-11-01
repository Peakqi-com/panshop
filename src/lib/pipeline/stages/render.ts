import path from "node:path";
import { promises as fs } from "node:fs";
import { z } from "zod";
import type { StageFn } from "@/lib/pipeline";
import { sparkJSON } from "@/lib/meta";
import { download, run, tmpDir } from "@/lib/ffmpeg";
import { putFile } from "@/lib/blob";
import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { tracks as trackRepo } from "@/repositories/tracks";
import { assets as assetRepo } from "@/repositories/assets";
import type { Track } from "@/models/track";
import sharp from "sharp";
import { badge, coverImage, endCard } from "@/lib/text-image";

const BUDGET_MS = 210_000;
const W = 1080, H = 1920;

const Copy = z.object({
  items: z.array(z.object({
    code: z.string(),
    caption: z.string().describe("IG 貼文文案，繁體中文，3 到 4 行，含價格與「留言 代碼 取得連結」，最多 3 個 hashtag"),
    hook: z.string().describe("短影片封面上的一句話，10 字內"),
    voiceover: z.string().describe("15 秒口白，繁體中文"),
  })),
});


/** 模型偶爾夾雜其他文字系統的字（例如西里爾字母），只留中日韓、拉丁、數字、標點與表情符號 */
const clean = (t: string) => t.replace(/[\u0400-\u04FF\u0500-\u052F\u0600-\u06FF\u0E00-\u0E7F]+/g, "").replace(/[ \t]{2,}/g, " ").trim();

/** stage 8：文案 → 每件一支 9:16 短影片（封面 → 跟著商品的原片片段 → 結尾字卡）→ 目錄 CSV 網址 */
const render: StageFn = async ({ job, jobId, log }) => {
  const t0 = Date.now();
  const list = (await itemRepo.forJob(jobId)).filter((i) => i.status === "confirmed");
  if (!list.length) throw new Error("沒有已確認的商品");
  const [trs, ass] = await Promise.all([trackRepo.forJob(jobId), assetRepo.forJob(jobId)]);
  const assetByItem = new Map(ass.map((a) => [String(a.itemId), a]));
  let usd = 0;

  // 文案：一次寫完所有還沒有文案的商品
  const needCopy = list.filter((i) => !assetByItem.get(String(i._id))?.caption);
  if (needCopy.length) {
    const { data, usd: u } = await sparkJSON({
      schema: Copy, name: "copy", effort: "low", maxTokens: 6000,
      system: `你是台灣的社群小編，替小賣家寫商品貼文與短影片口白。語氣親切、具體、不浮誇，只用繁體中文、阿拉伯數字與常見標點，不夾雜其他語言。幣別 ${job.currency}。店名「${job.shopName || "本店"}」。只能寫畫面與資料裡看得到的事實：不得捏造認證、檢驗、產地、功效、規格數字，也不得自行加優惠、折扣、贈品、免運、限時。沒有價格就寫「價格請私訊」。`,
      parts: [{ text: `請替以下每件商品各寫一份：\n${needCopy.map((i) => `- ${i.code}｜${i.title}｜${i.color} ${i.material}｜${i.price != null ? `${job.currency} ${i.price}` : "價格私訊"}｜${i.description}`).join("\n")}` }],
    });
    usd += u;
    for (const c of data.items) {
      const it = needCopy.find((i) => i.code === c.code);
      if (it) await assetRepo.upsert(it._id!, jobId, { caption: clean(c.caption), voiceover: `${clean(c.hook)}\n${clean(c.voiceover)}` });
    }
  }
  const assets2 = new Map((await assetRepo.forJob(jobId)).map((a) => [String(a.itemId), a]));

  const todo = list.filter((i) => !assets2.get(String(i._id))?.reelUrl);
  if (!todo.length) {
    await finish(jobId, usd);
    return { note: `${list.length} 支短影片` };
  }

  const dir = await tmpDir();
  try {
    const src = path.join(dir, "src.mp4");
    await download(job.video.originalUrl, src);
    const vw = job.video.width ?? 1920, vh = job.video.height ?? 1080;
    const pw = job.video.procWidth ?? vw, ph = job.video.procHeight ?? vh;
    const sx = vw / pw;
    void ph;
    let made = 0;

    for (const it of todo) {
      if (Date.now() - t0 > BUDGET_MS) {
        await jobs.addCost(jobId, usd);
        return { note: `短影片 ${list.length - todo.length + made}/${list.length}，繼續…`, again: true };
      }
      const a = assets2.get(String(it._id));
      const hook = (a?.voiceover ?? "").split("\n")[0] || it.title;
      const priceText = it.price != null ? `${job.currency} ${it.price.toLocaleString()}` : "私訊詢價";
      const itemDir = path.join(dir, it.code);
      await fs.mkdir(itemDir, { recursive: true });

      // 封面與結尾字卡用 canvas 畫（含中文字），片段用 overlay 貼代碼標籤，不依賴 drawtext
      const heroUrl = a?.studioUrl ?? a?.cutoutUrl ?? it.primaryCutoutUrl ?? it.primaryCropUrls[0];
      const hero = Buffer.from(await (await fetch(heroUrl)).arrayBuffer());
      const heroPng = await sharp(hero).resize(W - 160, W - 160, { fit: "contain", background: "#ffffff" }).png().toBuffer();
      const coverPng = path.join(itemDir, "cover.png");
      await fs.writeFile(coverPng, await coverImage({ width: W, height: H, heroPng, hook, price: priceText }));
      const endPng = path.join(itemDir, "end.png");
      await fs.writeFile(endPng, endCard(W, H, `留言 ${it.code} 取得連結`));
      const badgePng = path.join(itemDir, "badge.png");
      await fs.writeFile(badgePng, badge(it.code));
      const coverUrl = await putFile(`jobs/${job.code}/items/${it.code}/cover.png`, coverPng);

      // 片段：這件商品的 track 裡挑最多 2 段、各 4 秒，裁成 9:16 跟著框
      const segs = pickSegments(trs.filter((t) => it.trackIds.some((id) => String(id) === String(t._id))), job.video.durationSec ?? 0);
      const inputs: string[] = ["-loop", "1", "-t", "2.2", "-i", coverPng];
      segs.forEach((s) => inputs.push("-ss", s.start.toFixed(2), "-t", s.dur.toFixed(2), "-i", src));
      inputs.push("-loop", "1", "-t", "2.2", "-i", endPng, "-i", badgePng);
      const bIdx = segs.length + 2;
      const filters: string[] = [`[0:v]scale=${W}:${H},setsar=1,format=yuv420p[c]`];
      const parts = ["[c]"];
      segs.forEach((s, k) => {
        const cw = Math.min(vw, Math.round((vh * 9) / 16));
        const cx = Math.round(Math.max(0, Math.min(vw - cw, s.cx * sx - cw / 2)));
        filters.push(`[${k + 1}:v]crop=${cw}:${vh}:${cx}:0,scale=${W}:${H},setsar=1[s${k}];[s${k}][${bIdx}:v]overlay=60:120,format=yuv420p[v${k}]`);
        parts.push(`[v${k}]`);
      });
      filters.push(`[${segs.length + 1}:v]scale=${W}:${H},setsar=1,format=yuv420p[e]`);
      parts.push("[e]");
      filters.push(`${parts.join("")}concat=n=${parts.length}:v=1:a=0[out]`);
      const reel = path.join(itemDir, "reel.mp4");
      await run([...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", reel], { timeoutMs: 120_000 });
      const reelUrl = await putFile(`jobs/${job.code}/items/${it.code}/reel.mp4`, reel);
      const dur = 2.2 * 2 + segs.reduce((s, x) => s + x.dur, 0);
      await assetRepo.upsert(it._id!, jobId, { coverUrl, reelUrl, reelDurationSec: Number(dur.toFixed(1)), status: "done" });
      made++;
      log(`${it.code} reel ${dur.toFixed(1)}s`);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
  await finish(jobId, usd);
  return { note: `${list.length} 支短影片` };
};
export default render;

async function finish(jobId: import("mongodb").ObjectId, usd: number) {
  await jobs.addCost(jobId, usd);
  await jobs.patch(jobId, { catalogCsvUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/jobs/${String(jobId)}/catalog.csv` });
}

/** 從 track 挑片段：每條 track 以最佳影格為中心取 4 秒，最多 2 段，依時間排序 */
function pickSegments(ts: Track[], durationSec: number) {
  const out: { start: number; dur: number; cx: number }[] = [];
  for (const t of [...ts].sort((a, b) => (b.meanArea ?? 0) - (a.meanArea ?? 0)).slice(0, 2)) {
    const center = t.bestT ?? (t.startSec + t.endSec) / 2;
    const len = Math.min(4, Math.max(1.5, t.endSec - t.startSec));
    const start = Math.max(0, Math.min(durationSec - len, center - len / 2));
    const box = t.boxes.reduce((b, x) => (Math.abs(x.t - center) < Math.abs(b.t - center) ? x : b), t.boxes[0]);
    out.push({ start, dur: len, cx: (box.x1 + box.x2) / 2 });
  }
  return out.sort((a, b) => a.start - b.start);
}
