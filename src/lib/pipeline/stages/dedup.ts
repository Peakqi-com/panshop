import { z } from "zod";
import type { StageFn } from "@/lib/pipeline";
import { sparkJSON } from "@/lib/meta";
import { jobs } from "@/repositories/jobs";
import { tracks as trackRepo } from "@/repositories/tracks";
import { items as itemRepo } from "@/repositories/items";
import type { Track } from "@/models/track";
import type { Item } from "@/models/item";
import { PIPE } from "@/lib/config";

const Out = z.object({
  groups: z.array(z.array(z.number().int())).describe("每個子陣列是同一件實體商品的影像編號；每個編號只能出現一次"),
});

const overlaps = (a: Track, b: Track) => a.startSec < b.endSec && b.startSec < a.endSec;

/** 這段影像是否大多貼在畫面邊緣（只拍到一部分） */
function edgeNote(t: Track) {
  const edge = t.boxes.filter((b) => b.x1 <= 2 || b.x2 >= b.w - 2 || b.y1 <= 2 || b.y2 >= b.h - 2).length / Math.max(1, t.boxes.length);
  return edge > 0.6 ? "，貼在畫面邊緣、可能只拍到一部分" : "";
}

/**
 * stage 4：同品類的 track 合併成 item。
 * 規則一：時間重疊的兩條 track 同時出現在畫面上，一定是不同件。
 * 規則二：不重疊的 track 才可能是同一件出鏡再入鏡，交給 Spark 看裁圖判斷。
 */
const Verify = z.object({
  tracks: z.array(z.object({
    index: z.number().int(),
    category: z.string().describe("清單中的品類名；都不是或不是商品就填 none"),
    confidence: z.number().describe("0 到 1"),
  })),
});

const dedup: StageFn = async ({ job, jobId, log }) => {
  const all = await trackRepo.forJob(jobId);
  if (!all.length) throw new Error("沒有 track 可去重");
  const drafts: Omit<Item, "_id" | "createdAt" | "updatedAt">[] = [];
  let usd = 0;

  // 先驗證品類：SAM 的名詞片語會把長得像的東西一起抓進來（例如把皮革日誌本當成杯子），
  // 用 Spark 看每條 track 的主裁圖重新歸類，不是商品的直接剔除
  for (const t of all) if (t.samCategory) t.category = t.samCategory;  // 重跑時從 SAM 原判定重新驗證，不累積上一輪的修改
  const withCrop = all.filter((t) => t.crops.length);
  if (withCrop.length) {
    const names = job.categories.map((c) => c.name);
    const { data, usd: u } = await sparkJSON({
      schema: Verify, name: "verify_categories", effort: PIPE.sparkEffort,
      system: "你是商品盤點員。依照裁圖判斷每段影像裡的主體屬於哪一個品類；只看主體，不看背景。",
      parts: [
        { text: `品類清單：${names.join("、")}。以下 ${withCrop.length} 段影像（白底去背圖，只看被切出來的那個主體，旁邊若有殘留的其他東西不算），每段回一個品類與信心；主體不在清單內、或只是桌面、手、包裝、背景雜物，就回 none。` },
        ...withCrop.flatMap((t, i) => [{ text: `影像 ${i}（原判定：${t.category}）` }, { imageUrl: (t.cutouts[Math.floor(t.cutouts.length / 2)] ?? t.crops[Math.floor(t.crops.length / 2)]).url }]),
      ],
    });
    usd += u;
    for (const v of data.tracks) {
      const t = withCrop[v.index];
      if (!t || v.confidence < 0.8) continue;   // 只在很有把握時才改原判定
      if (v.category === "none") { t.category = "__drop__"; log(`drop track ${t.samObjectId}: 非商品`); }
      else if (names.includes(v.category) && v.category !== t.category) { log(`track ${t.samObjectId}: ${t.category} → ${v.category}`); t.category = v.category; }
    }
    await Promise.all(all.map((t) => trackRepo.patch(t._id!, { category: t.category })));
  }

  for (const [ci, cat] of job.categories.entries()) {
    const ts = all.filter((t) => t.category === cat.name && t.crops.length);
    if (!ts.length) continue;
    // union-find
    const parent = ts.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const union = (a: number, b: number) => { parent[find(a)] = find(b); };

    const pairs: [number, number][] = [];
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) if (!overlaps(ts[i], ts[j])) pairs.push([i, j]);

    if (pairs.length) try {
      const conflict: string[] = [];
      for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) if (overlaps(ts[i], ts[j])) conflict.push(`${i + 1}-${j + 1}`);
      const { data, usd: u } = await sparkJSON({
        schema: Out,
        name: "dedup_groups",
        effort: "medium",
        system: "你是商品盤點員。賣家拿手機掃過桌上的商品，同一件商品會從畫面邊緣進入、離開、之後鏡頭掃回來又再出現，所以會被切成多段，其中有些段只拍到一部分（例如只有杯子的一側或把手）。你要判斷哪些影像是同一件實體商品（同款同色同尺寸），而不是只看品類相同。",
        parts: [
          { text: `品類「${cat.name}」共有 ${ts.length} 段影像，每段給 1 到 ${PIPE.cropsPerTrack} 張裁圖，並標示時間與是否貼在畫面邊緣。請把屬於同一件實體商品的影像編號分在同一組，不同件就各自一組；每個編號只出現一次，全部 ${ts.length} 個編號都要出現。規則：\n1. ${conflict.length ? `以下編號曾同時出現在畫面上，絕不能同組：${conflict.join("、")}。` : "沒有兩段同時出現在畫面上。"}\n2. 顏色、花紋、形狀、標籤細節明確不同就是不同件。\n3. 只拍到一部分、貼在畫面邊緣的短片段，若顏色材質與另一段完整的商品一致，應視為同一件（鏡頭正在進入或離開它）。\n4. 其餘拿不準時偏向「不同件」。` },
          ...ts.flatMap((t, i) => [{ text: `影像 ${i + 1}（${t.startSec.toFixed(1)}s 到 ${t.endSec.toFixed(1)}s${edgeNote(t)}）` }, ...t.crops.slice(0, PIPE.cropsPerTrack).map((c) => ({ imageUrl: c.url }))]),
        ],
      });
      usd += u;
      for (const g of data.groups) {
        const idx = g.map((n) => n - 1).filter((n) => n >= 0 && n < ts.length);
        for (let k = 1; k < idx.length; k++) {
          // 規則一優先：若與組內任一成員時間重疊就不合併
          const root = find(idx[0]);
          const members = idx.slice(0, k).filter((m) => find(m) === root);
          if (members.some((m) => overlaps(ts[m], ts[idx[k]]))) continue;
          union(idx[0], idx[k]);
        }
      }
    } catch (e) {
      log(`${cat.name} 分組失敗，先各自成件：${(e as Error).message.slice(0, 160)}`);
    }

    const groups = new Map<number, Track[]>();
    for (let i = 0; i < ts.length; i++) {
      const r = find(i);
      groups.set(r, [...(groups.get(r) ?? []), ts[i]]);
    }
    const letter = String.fromCharCode(65 + ci);
    const ordered = [...groups.values()].sort((a, b) => Math.min(...a.map((t) => t.startSec)) - Math.min(...b.map((t) => t.startSec)));
    ordered.forEach((g, n) => {
      const best = [...g].sort((a, b) => (b.meanArea ?? 0) * (b.meanConf ?? 0) - (a.meanArea ?? 0) * (a.meanConf ?? 0));
      const crops = best.flatMap((t) => t.crops.map((c) => c.url)).slice(0, PIPE.cropsPerTrack);
      const cutout = best.find((t) => t.cutouts.length)?.cutouts[0]?.url;
      drafts.push({
        jobId, code: `${letter}${n + 1}`, status: "draft", trackIds: g.map((t) => t._id!), category: cat.name,
        primaryCropUrls: crops, primaryCutoutUrl: cutout, title: "", color: "", material: "", price: null, currency: job.currency,
        description: "", attributes: {}, googleProductCategory: "", sceneHint: "", confidence: { title: 0, price: 0, overall: 0 },
        sources: { vision: true, speech: false }, speechEvidence: "", userEdited: {},
      });
    });
    log(`${cat.name}: ${ts.length} tracks → ${ordered.length} items`);
  }

  const saved = await itemRepo.replaceForJob(jobId, drafts);
  await jobs.addCost(jobId, usd);
  await jobs.patch(jobId, { "metrics.itemCount": saved.length });
  return { note: `${all.length} tracks → ${saved.length} items` };
};
export default dedup;
