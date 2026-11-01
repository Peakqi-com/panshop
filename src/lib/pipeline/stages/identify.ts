import { z } from "zod";
import type { StageFn } from "@/lib/pipeline";
import { sparkJSON } from "@/lib/meta";
import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { tracks as trackRepo } from "@/repositories/tracks";
import { PIPE } from "@/lib/config";

const Out = z.object({
  title: z.string().describe("商品名稱，繁體中文，15 字內，含關鍵特徵，例如 霧面白色陶瓷馬克杯"),
  color: z.string(),
  material: z.string(),
  description: z.string().describe("兩到三句的賣點描述，繁體中文"),
  price: z.number().nullable().describe("只有口述明確提到才填，否則 null"),
  googleProductCategory: z.string().describe("Google 商品分類英文全路徑，例如 Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs"),
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
    const speechText = turns.length ? turns.map((t) => `[${t.startSec.toFixed(1)}s] ${t.text}${t.prices.length ? `（價格 ${t.prices.join("/")}）` : ""}`).join("\n") : "（這段時間沒有口述）";
    const { data, usd: u } = await sparkJSON({
      schema: Out,
      name: "product",
      effort: PIPE.sparkEffort,
      system: `你是電商上架助理，替台灣的小賣家寫商品資料。輸出繁體中文（Google 分類除外）。品名以畫面為準、口述為輔；價格只能來自口述，畫面上的價格標籤也算口述證據。幣別 ${job.currency}。`,
      parts: [
        { text: `商品編號 ${it.code}，品類「${it.category}」。以下是這件商品的裁圖（同一件、不同角度），以及它入鏡時段的口述：\n${speechText}` },
        ...it.primaryCropUrls.map((u) => ({ imageUrl: u })),
        ...(it.primaryCutoutUrl ? [{ imageUrl: it.primaryCutoutUrl }] : []),
      ],
    });
    usd += u;
    if (data.speechUsed) speechHits++;
    const conf = { title: clamp(data.confidenceTitle), price: clamp(data.confidencePrice), overall: 0 };
    conf.overall = Number((conf.title * 0.7 + (data.price != null ? conf.price : 0.5) * 0.3).toFixed(2));
    await itemRepo.setFields(it._id!, {
      title: data.title, color: data.color, material: data.material, description: data.description,
      price: data.price, googleProductCategory: data.googleProductCategory,
      attributes: Object.fromEntries(data.attributes.map((a) => [a.key, a.value])),
      confidence: conf, sources: { vision: true, speech: data.speechUsed }, speechEvidence: data.speechEvidence,
    });
    log(`${it.code} ${data.title} ${data.price ?? "-"} (${conf.overall})`);
  });

  for (let i = 0; i < work.length; i += PIPE.identifyConcurrency) await Promise.all(work.slice(i, i + PIPE.identifyConcurrency).map((f) => f()));
  await jobs.addCost(jobId, usd);
  return { note: `${list.length} 件，${speechHits} 件用到口述` };
};
export default identify;

const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
