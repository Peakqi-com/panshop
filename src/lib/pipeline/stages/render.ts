import path from "node:path";
import { promises as fs } from "node:fs";
import type { ObjectId } from "mongodb";
import { z } from "zod";
import type { StageFn } from "@/lib/pipeline";
import { sparkJSON } from "@/lib/meta";
import { download, run, tmpDir } from "@/lib/ffmpeg";
import { putFile } from "@/lib/blob";
import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { tracks as trackRepo } from "@/repositories/tracks";
import { assets as assetRepo } from "@/repositories/assets";
import type { Job } from "@/models/job";
import type { Item } from "@/models/item";
import type { Asset } from "@/models/asset";
import { renderAd } from "@/lib/video/ad";
import { renderAdV2, type SceneSpec } from "@/lib/video/ad2";
import { writeStoryboard, ensureSceneImages } from "@/lib/video/storyboard";
import { synthesize, stripDirection } from "@/lib/video/tts";
import { settings } from "@/repositories/settings";
import { STYLES, type StyleId } from "@/lib/config";

const BUDGET_MS = 210_000;

const Copy = z.object({
  items: z.array(z.object({
    code: z.string(),
    caption: z.string().describe("IG 貼文文案，繁體中文，3 到 4 行，含價格與「留言 代碼 取得連結」，最多 3 個 hashtag"),
    captionShort: z.string().describe("限時動態用的一句話，15 字內，含代碼"),
    captionLong: z.string().describe("商品頁完整介紹，80 到 150 字，分兩段，不含 hashtag"),
    hook: z.string().describe("短影片開頭的一句鉤子，10 字內"),
    sellingPoints: z.array(z.string()).describe("三個賣點，每個 4 到 8 字，只能來自畫面與資料"),
    voiceover: z.string().describe("15 秒口白，繁體中文"),
  })),
});

/** 模型偶爾夾雜其他文字系統的字（例如西里爾字母），只留中日韓、拉丁、數字、標點與表情符號 */
const clean = (t: string) => t.replace(/[Ѐ-ӿԀ-ԯ؀-ۿ฀-๿]+/g, "").replace(/[ \t]{2,}/g, " ").trim();

/** stage 8：文案 → 每件一支商品形象廣告短片 → 目錄 CSV 網址 */
const render: StageFn = async ({ job, jobId, log }) => {
  const t0 = Date.now();
  const list = (await itemRepo.forJob(jobId)).filter((i) => i.status === "confirmed");
  if (!list.length) throw new Error("沒有已確認的商品");
  const ass = await assetRepo.forJob(jobId);
  const assetByItem = new Map(ass.map((a) => [String(a.itemId), a]));
  let usd = 0;

  const needCopy = list.filter((i) => !assetByItem.get(String(i._id))?.caption);
  if (needCopy.length) {
    usd += await writeCopy(job, jobId, needCopy);
  }
  const assets2 = new Map((await assetRepo.forJob(jobId)).map((a) => [String(a.itemId), a]));
  const todo = list.filter((i) => !assets2.get(String(i._id))?.reelUrl);
  if (!todo.length) { await finish(jobId, usd); return { note: `${list.length} 支短影片` }; }

  const trs = await trackRepo.forJob(jobId);
  let made = 0;
  for (const it of todo) {
    if (Date.now() - t0 > BUDGET_MS) {
      await jobs.addCost(jobId, usd);
      return { note: `短影片 ${list.length - todo.length + made}/${list.length}，繼續…`, again: true };
    }
    const a = assets2.get(String(it._id));
    if (!a) continue;
    const spans = it.trackIds.map((id) => trs.find((t) => String(t._id) === String(id))).filter(Boolean).map((t) => [t!.startSec, t!.endSec] as const);
    const r = await renderItem(job, it, a, spans, log);
    made++;
    log(`${it.code} 短片 ${r.ok ? "完成" : `失敗：${r.error}`}`);
  }
  await finish(jobId, usd);
  return { note: `${list.length} 支短影片` };
};
export default render;

async function writeCopy(job: Job, jobId: ObjectId, needCopy: Item[]) {
  const { data, usd } = await sparkJSON({
    schema: Copy, name: "copy", effort: "low", maxTokens: 9000,
    system: `你是台灣的社群小編，替小賣家寫商品貼文與短影片口白。語氣親切、具體、不浮誇，只用繁體中文、阿拉伯數字與常見標點，不夾雜其他語言。幣別 ${job.currency}。店名「${job.shopName || "本店"}」。只能寫畫面與資料裡看得到的事實：不得捏造認證、檢驗、產地、功效、規格數字，也不得自行加優惠、折扣、贈品、免運、限時。沒有價格就寫「價格請私訊」。`,
    parts: [{ text: `請替以下每件商品各寫一份：\n${needCopy.map((i) => `- ${i.code}｜${i.title}｜${i.color} ${i.material}｜${i.price != null ? `${job.currency} ${i.price}` : "價格私訊"}｜${i.description}`).join("\n")}` }],
  });
  for (const c of data.items) {
    const it = needCopy.find((i) => i.code === c.code);
    if (it) await assetRepo.upsert(it._id!, jobId, { caption: clean(c.caption), captionShort: clean(c.captionShort), captionLong: clean(c.captionLong), hook: clean(c.hook), sellingPoints: c.sellingPoints.slice(0, 3).map(clean), voiceover: clean(c.voiceover) });
  }
  return usd;
}

/** 單件短片：stage 與「重做這件短片」共用。v2 分鏡流程失敗時退回 v1 */
export async function renderItem(job: Job, it: Item, a: Asset, spans: readonly (readonly [number, number])[], log: (m: string) => void) {
  const dir = await tmpDir("ad-");
  try {
    const style = (job.style as StyleId) in STYLES ? (job.style as StyleId) : "lifestyle";
    const cfg = await settings.get();
    const dl = async (url: string | undefined, name: string) => (url ? download(url, path.join(dir, name)).catch(() => undefined) : undefined);
    const cutoutPath = await dl(a.cutoutUrl ?? it.primaryCutoutUrl, "cutout.png");
    let usd = 0;

    // 1. 分鏡（已有就沿用，讓使用者改過的分鏡不會被蓋掉）
    let sb = a.storyboard;
    if (!sb) {
      const w = await writeStoryboard(job, it, a); usd += w.usd;
      const { scenes, usd: u2 } = await ensureSceneImages(job, it, a, w.sb, log); usd += u2;
      sb = { hook: w.sb.hook, cta: w.sb.cta || `留言 ${it.code} 取得連結`, scenes };
      await assetRepo.upsert(it._id!, job._id!, { storyboard: sb, hook: a.hook || w.sb.hook });
    }

    // 2. 配音：專業 TTS（Fish 優先、OpenAI 備援）→ 賣家原聲 → 無
    const voice = await prepareVoice(job, it, sb.scenes, spans, cfg.voiceMode, dir, log);

    // 3. 每一場的素材與時長（旁白比預設長就延長那一場）
    const scenes: SceneSpec[] = [];
    let cursor = 0;
    for (const [i, sc] of sb.scenes.entries()) {
      const imagePath = await dl(sc.imageUrl, `sc${i}.img`);
      const v = voice.clips[i];
      const dur = Math.max(sc.durationSec, (v?.dur ?? 0) + 0.8);
      scenes.push({ durationSec: dur, imagePath, kind: ["front", "threeQuarter", "side"].includes(sc.shot) ? "studio" : "photo", motion: sc.motion,
        subtitle: stripDirection(sc.subtitle || sc.narration), overlay: sc.overlay as SceneSpec["overlay"],
        narrationPath: v?.path, narrationStart: v ? cursor + 0.25 : undefined, narrationDur: v?.dur });
      cursor += dur;
    }
    const r = await renderAdV2({ code: it.code, title: it.title || it.category, price: it.price, currency: job.currency, storeName: job.shopName || "PanShop", style,
      hook: sb.hook || a.hook || it.title, cta: `留言 ${it.code} 取得連結`, cutoutPath, scenes, workDir: dir });
    const stamp = Date.now().toString(36);
    const [reelUrl, coverUrl] = await Promise.all([
      putFile(`jobs/${job.code}/items/${stamp}/${it.code}/ad.mp4`, r.mp4),
      putFile(`jobs/${job.code}/items/${stamp}/${it.code}/cover.png`, r.cover),
    ]);
    await assetRepo.upsert(it._id!, job._id!, { reelUrl, coverUrl, reelDurationSec: r.durationSec, status: "done", storyboard: { ...sb, voice: voice.mode } });
    await jobs.addCost(job._id!, usd);
    return { ok: true as const, reelUrl, coverUrl };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`${it.code} v2 短片失敗，退回 v1：${msg.slice(0, 200)}`);
    try {
      return await renderItemV1(job, it, a, spans, dir, log);
    } catch (e2) {
      const m2 = e2 instanceof Error ? e2.message : String(e2);
      await assetRepo.upsert(it._id!, job._id!, { status: "failed", error: m2.slice(0, 500) });
      return { ok: false as const, error: m2 };
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** 配音準備：回每一場的音檔與長度 */
async function prepareVoice(job: Job, it: Item, scenes: { narration: string }[], spans: readonly (readonly [number, number])[], mode: "tts" | "seller" | "none", dir: string, log: (m: string) => void) {
  const clips: ({ path: string; dur: number } | undefined)[] = scenes.map(() => undefined);
  if (mode === "none") return { mode: "none", clips };
  if (mode === "tts") {
    let provider = "";
    for (const [i, sc] of scenes.entries()) {
      const text = sc.narration?.trim(); if (!text) continue;
      const tts = await synthesize(text);
      if (!tts) { provider = ""; break; }
      provider = tts.provider;
      const mp3 = path.join(dir, `n${i}.mp3`), wav = path.join(dir, `n${i}.wav`);
      await fs.writeFile(mp3, tts.audio);
      await run(["-y", "-i", mp3, "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", wav]);
      const bytes = (await fs.stat(wav)).size - 44;
      clips[i] = { path: wav, dur: Math.max(0.5, bytes / (48000 * 2)) };
    }
    if (provider) { log(`${it.code} 配音 ${provider}`); return { mode: provider, clips }; }
    log(`${it.code} 沒有 TTS 金鑰，退回賣家原聲`);
    clips.fill(undefined);
  }
  // 賣家原聲：把講這件商品的那一句放在第二場（hero），其餘無口白
  if (job.video.audioUrl && job.transcript.length && spans.length) {
    const turns = job.transcript.filter((tu) => spans.some(([s, e]) => tu.startSec < e + 1.5 && s - 1.5 < tu.endSec));
    const turn = turns.find((t) => t.prices.length) ?? turns[0];
    if (turn) {
      const seg = pickSentence(turn.text, it, job.currency);
      const turnDur = Math.max(0.5, turn.endSec - turn.startSec);
      const start = Math.max(0, turn.startSec + turnDur * seg.from - 0.15);
      const dur = Math.min(8, Math.max(1, turnDur * (seg.to - seg.from) + 0.35));
      const src = await download(job.video.audioUrl, path.join(dir, "audio.wav")).catch(() => undefined);
      const out = path.join(dir, "voice.wav");
      if (src) {
        await run(["-y", "-ss", start.toFixed(2), "-t", dur.toFixed(2), "-i", src, "-af", "afade=t=in:d=0.08,afade=t=out:st=" + Math.max(0, dur - 0.2).toFixed(2) + ":d=0.2", out]).catch(() => undefined);
        if (await fs.stat(out).then(() => true, () => false)) { clips[Math.min(1, clips.length - 1)] = { path: out, dur }; return { mode: "seller", clips }; }
      }
    }
  }
  return { mode: "none", clips };
}

/** v1：去背主角加賣點卡（分鏡失敗時的備援） */
async function renderItemV1(job: Job, it: Item, a: Asset, spans: readonly (readonly [number, number])[], dir: string, log: (m: string) => void) {
  const style = (job.style as StyleId) in STYLES ? (job.style as StyleId) : "lifestyle";
  const shots = a.shots ?? [];
  const pick = (k: string) => shots.find((s) => s.kind === k)?.url;
  const dl = async (url: string | undefined, name: string) => (url ? download(url, path.join(dir, name)).catch(() => undefined) : undefined);
  const cutoutPath = await dl(a.cutoutUrl ?? it.primaryCutoutUrl, "cutout.png");
  const heroPath = await dl(it.heroUrl ?? pick("threeQuarter") ?? a.studioUrl ?? pick("front"), "hero.img");
  const lifestylePath = await dl(pick("lifestyle") ?? a.lifestyleUrl, "life.img");
  const shotPaths = (await Promise.all(["front", "threeQuarter", "side"].map((k, i) => dl(pick(k), `shot${i}.img`)))).filter(Boolean) as string[];
  const voice = await prepareVoice(job, it, [{ narration: "" }, { narration: "" }], spans, "seller", dir, log);
  const v = voice.clips[1];
  const r = await renderAd({
    code: it.code, title: it.title || it.category, price: it.price, currency: job.currency, storeName: job.shopName || "PanShop", style,
    hook: a.hook || it.title, sellingPoints: a.sellingPoints?.length ? a.sellingPoints : [it.color, it.material, it.category].filter(Boolean), subtitle: undefined,
    cutoutPath, heroPath, lifestylePath, shotPaths, voicePath: v?.path, voiceStartSec: v ? 1.6 : undefined, voiceDurSec: v?.dur, workDir: dir,
  });
  const stamp = Date.now().toString(36);
  const [reelUrl, coverUrl] = await Promise.all([putFile(`jobs/${job.code}/items/${stamp}/${it.code}/ad.mp4`, r.mp4), putFile(`jobs/${job.code}/items/${stamp}/${it.code}/cover.png`, r.cover)]);
  await assetRepo.upsert(it._id!, job._id!, { reelUrl, coverUrl, reelDurationSec: r.durationSec, status: "done" });
  return { ok: true as const, reelUrl, coverUrl };
}

/** 從一段口述裡挑出講這件商品的句子，回傳句子文字與它在整段中的字元比例區間 */
function pickSentence(text: string, it: Item, currency: string): { text: string; from: number; to: number } {
  const parts: { text: string; from: number; to: number }[] = [];
  let pos = 0;
  for (const m of text.split(/(?<=[。！？!?；;])/)) { if (m.trim()) parts.push({ text: m.trim(), from: pos / text.length, to: (pos + m.length) / text.length }); pos += m.length; }
  if (parts.length <= 1) return { text, from: 0, to: 1 };
  const keys = [it.title, it.color, it.material, it.category].filter(Boolean).flatMap((k) => k.split(/[\s，、]/)).filter((k) => k.length >= 2);
  const price = it.price != null ? String(it.price) : null;
  const score = (p: string) => keys.reduce((n, k) => n + (p.includes(k) ? 2 : 0), 0) + (price && p.includes(price) ? 3 : 0) + (price && hasChinesePrice(p, it.price!) ? 3 : 0);
  void currency;
  const best = [...parts].sort((a, b) => score(b.text) - score(a.text))[0];
  return score(best.text) > 0 ? best : { text, from: 0, to: 1 };
}

/** 口述裡的中文數字價格（例如 兩百九十、一千九百八十）是否等於這個價格 */
function hasChinesePrice(text: string, price: number): boolean {
  const map: Record<string, number> = { 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const unit: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 萬: 10000 };
  const m = text.match(/[零一二兩三四五六七八九十百千萬]+(?=元|塊)/g);
  if (!m) return false;
  for (const s of m) {
    let total = 0, cur = 0;
    for (const ch of s) { if (map[ch] != null) cur = map[ch]; else if (unit[ch]) { total += (cur || 1) * unit[ch]; cur = 0; } }
    if (total + cur === price) return true;
  }
  return false;
}

async function finish(jobId: ObjectId, usd: number) {
  await jobs.addCost(jobId, usd);
  await jobs.patch(jobId, { catalogCsvUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/jobs/${String(jobId)}/catalog.csv` });
}
