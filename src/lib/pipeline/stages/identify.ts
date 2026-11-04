import { z } from "zod";
import type { StageFn } from "@/lib/pipeline";
import { sparkJSON } from "@/lib/meta";
import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { tracks as trackRepo } from "@/repositories/tracks";
import { PIPE } from "@/lib/config";
import { isEn, withLang } from "@/lib/video/lang";
import type { ObjectId } from "mongodb";

const Out = z.object({
  title: z.string().describe("商品名稱，繁體中文，15 字內，含關鍵特徵，例如 霧面白色陶瓷馬克杯"),
  color: z.string(),
  material: z.string(),
  description: z.string().describe("兩到三句的賣點描述，繁體中文"),
  price: z.number().nullable().describe("只有口述明確提到才填，否則 null"),
  googleProductCategory: z.string().describe("Google 商品分類英文全路徑，例如 Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs"),
  sceneHint: z.string().describe("英文，一句話描述最適合拍這件商品的情境場景（地點、搭配道具、光線），不含文字與人臉"),
  attributes: z.array(z.object({ key: z.string(), value: z.string() })).describe("其他屬性，例如 尺寸、容量、品牌、款式"),
  confidenceTitle: z.number().describe("0 到 1"),
  confidencePrice: z.number().describe("0 到 1，沒價格就 0"),
  speechUsed: z.boolean().describe("是否用到了口述內容"),
  speechEvidence: z.string().describe("用到的口述原句，沒有就空字串"),
});

/** stage 6：每件商品看裁圖與對應時段的口述，產生品名、屬性、價格、描述 */
const identify: StageFn = async ({ job, jobId, log }) => {
  const [list, trs] = await Promise.all([itemRepo.forJob(jobId), trackRepo.forJob(jobId)]);
  if (!list.length) throw new Error("沒有商品可辨識");
  const trById = new Map(trs.map((t) => [String(t._id), t]));
  let usd = 0, speechHits = 0;

  const work = list.map((it) => async () => {
    const spans = it.trackIds.map((id) => trById.get(String(id))).filter(Boolean).map((t) => [t!.startSec - 1.5, t!.endSec + 1.5] as const);
    const turns = job.transcript.filter((tu) => spans.some(([a, b]) => tu.startSec < b && a < tu.endSec));
    const speechText = turns.length ? turns.map((t) => `[${t.startSec.toFixed(1)}s] ${t.text}${t.prices.length ? `（這句抽到的價格：${t.prices.join("、")}）` : ""}`).join("\n") : "（這段時間沒有口述）";
    const candidatePrices = Array.from(new Set(turns.flatMap((t) => t.prices)));
    const { data, usd: u } = await sparkJSON({
      schema: Out,
      name: "product",
      effort: PIPE.sparkEffort,
      system: withLang(`你是電商上架助理，替台灣的小賣家寫商品資料。輸出繁體中文（Google 分類除外）。品名以畫面為準、口述為輔；價格只能來自口述，畫面上的價格標籤也算口述證據。幣別 ${job.currency}。`, isEn(job)),
      parts: [
        { text: `商品編號 ${it.code}，品類「${it.category}」。以下是這件商品的裁圖（同一件、不同角度），以及它入鏡時段的口述：\n${speechText}\n${candidatePrices.length ? `口述時段內出現的價格候選：${candidatePrices.join("、")}。若其中一個價格緊跟著描述這件商品的句子，就採用它。` : ""}` },
        ...it.primaryCropUrls.map((u) => ({ imageUrl: u })),
        ...(it.primaryCutoutUrl ? [{ imageUrl: it.primaryCutoutUrl }] : []),
      ],
    });
    usd += u;
    // 模型偶爾會在證據明確時仍回 null：口述時段只有一個價格候選，且模型自己也說用到了口述，就補上
    let price = data.price;
    let confPrice = data.confidencePrice;
    if (price == null && candidatePrices.length === 1 && (data.speechUsed || data.speechEvidence)) { price = candidatePrices[0]; confPrice = Math.max(confPrice, 0.6); }
    if (data.speechUsed) speechHits++;
    const conf = { title: clamp(data.confidenceTitle), price: clamp(confPrice), overall: 0 };
    conf.overall = Number((conf.title * 0.7 + (price != null ? conf.price : 0.5) * 0.3).toFixed(2));
    await itemRepo.setFields(it._id!, {
      title: data.title, color: data.color, material: data.material, description: data.description,
      price, googleProductCategory: data.googleProductCategory, sceneHint: data.sceneHint,
      attributes: Object.fromEntries(data.attributes.map((a) => [a.key, a.value])),
      confidence: conf, sources: { vision: true, speech: data.speechUsed }, speechEvidence: data.speechEvidence,
    });
    log(`${it.code} ${data.title} ${price ?? "-"} (${conf.overall})`);
  });

  for (let i = 0; i < work.length; i += PIPE.identifyConcurrency) await Promise.all(work.slice(i, i + PIPE.identifyConcurrency).map((f) => f()));

  // 第二輪去重：現在每件都有品名與顏色了，再問一次哪些其實是同一件（補 dedup 只看裁圖時漏掉的）
  const merged = await mergeDuplicates(jobId, trById, log);
  usd += merged.usd;
  const finalCount = list.length - merged.removed;
  await jobs.patch(jobId, { "metrics.itemCount": finalCount });
  await jobs.addCost(jobId, usd);
  return { note: `${finalCount} 件，${speechHits} 件用到口述${merged.removed ? `，合併 ${merged.removed} 件重複` : ""}` };
};

const MergeOut = z.object({ groups: z.array(z.array(z.string())).describe("每組是同一件實體商品的代碼；只列有兩個以上代碼的組") });

async function mergeDuplicates(jobId: ObjectId, trById: Map<string, { startSec: number; endSec: number }>, log: (m: string) => void) {
  const list = await itemRepo.forJob(jobId);
  const span = (it: (typeof list)[number]) => it.trackIds.map((id) => trById.get(String(id))).filter(Boolean) as { startSec: number; endSec: number }[];
  const overlap = (a: (typeof list)[number], b: (typeof list)[number]) => span(a).some((x) => span(b).some((y) => x.startSec < y.endSec && y.startSec < x.endSec));
  const byCat = new Map<string, typeof list>();
  for (const it of list) byCat.set(it.category, [...(byCat.get(it.category) ?? []), it]);
  let usd = 0, removed = 0;
  for (const [cat, items] of byCat) {
    if (items.length < 2) continue;
    const conflicts: string[] = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (overlap(items[i], items[j])) conflicts.push(`${items[i].code}-${items[j].code}`);
    const { data, usd: u } = await sparkJSON({
      schema: MergeOut, name: "merge", effort: "medium",
      system: "你是商品盤點員。同一件商品可能在影片裡被切成兩筆：一筆完整、一筆只拍到一部分（鏡頭進出畫面時）。請找出其實是同一件實體商品的代碼。",
      parts: [
        { text: `品類「${cat}」的商品：\n${items.map((it) => `${it.code}｜${it.title}｜${it.color}｜${it.material}｜${span(it).map((s) => `${s.startSec.toFixed(1)}-${s.endSec.toFixed(1)}s`).join(",")}`).join("\n")}\n\n${conflicts.length ? `曾同時出現在畫面上、絕不能合併：${conflicts.join("、")}。` : ""}同款同色同材質、且時間不重疊的，很可能是同一件；品名描述的是明顯不同的款式或顏色就不是。只回有兩個以上代碼的組。` },
        ...items.flatMap((it) => [{ text: it.code }, ...it.primaryCropUrls.slice(0, 2).map((u) => ({ imageUrl: u }))]),
      ],
    });
    usd += u;
    for (const g of data.groups) {
      const members = g.map((c) => items.find((it) => it.code === c)).filter(Boolean) as typeof list;
      if (members.length < 2) continue;
      const ok = members.every((a, i) => members.slice(i + 1).every((b) => !overlap(a, b)));
      if (!ok) continue;
      const keep = [...members].sort((a, b) => b.confidence.overall - a.confidence.overall || b.trackIds.length - a.trackIds.length)[0];
      const rest = members.filter((m) => m !== keep);
      await itemRepo.setFields(keep._id!, {
        trackIds: [...keep.trackIds, ...rest.flatMap((r) => r.trackIds)],
        price: keep.price ?? rest.find((r) => r.price != null)?.price ?? null,
        speechEvidence: keep.speechEvidence || rest.find((r) => r.speechEvidence)?.speechEvidence || "",
        sources: { vision: true, speech: keep.sources.speech || rest.some((r) => r.sources.speech) },
      });
      for (const r of rest) { await itemRepo.setFields(r._id!, { status: "deleted", title: `${r.title}（併入 ${keep.code}）` }); removed++; }
      log(`merge ${rest.map((r) => r.code).join("+")} → ${keep.code}`);
    }
  }
  return { usd, removed };
}
export default identify;

const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
