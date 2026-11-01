/**
 * 件數與品名準確率：node --env-file=.env.local --import tsx eval/count_accuracy.mts <jobCode> <labels.json>
 * 件數準確率 = 正確對上的件數 ÷ 標準答案件數；多切（幽靈件）與漏切分開列。
 * 配對用 Spark 做：把系統品名與標準品名丟給模型配對，避免字面比對太死。
 */
import { promises as fs } from "node:fs";
import { z } from "zod";
import { sparkJSON } from "../src/lib/meta";

const [code, labelsPath] = process.argv.slice(2);
const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const labels = JSON.parse(await fs.readFile(labelsPath, "utf8")) as { items: { code: string; category: string; title: string; price: number }[] };
const d = (await (await fetch(`${base}/api/jobs/${code}`)).json()) as { items: { code: string; category: string; title: string; price: number | null; sources: { speech: boolean } }[]; job: { metrics: Record<string, number>; stages: Record<string, { ms?: number }> } };

const Out = z.object({ pairs: z.array(z.object({ system: z.string(), truth: z.string().nullable(), titleCorrect: z.boolean(), categoryCorrect: z.boolean() })) });
const { data } = await sparkJSON({
  schema: Out, name: "match", effort: "medium",
  system: "你是評測員。把系統輸出的商品清單對到標準答案：同一件實體商品才配對（同品類、同顏色、同款式）；每個標準答案最多被一個系統項目配到；配不到就 truth 為 null。titleCorrect 指系統品名與標準品名描述同一件且關鍵特徵（顏色、材質、品項）沒錯；categoryCorrect 指品類相同。",
  parts: [{ text: `系統輸出：\n${d.items.map((i) => `${i.code}｜${i.category}｜${i.title}｜${i.price ?? "-"}`).join("\n")}\n\n標準答案：\n${labels.items.map((i) => `${i.code}｜${i.category}｜${i.title}｜${i.price}`).join("\n")}` }],
});
const matched = data.pairs.filter((p) => p.truth);
const truthHit = new Set(matched.map((p) => p.truth));
const n = labels.items.length;
const countAcc = truthHit.size / n;
const ghosts = d.items.length - matched.length;
const titleAcc = matched.filter((p) => p.titleCorrect).length / Math.max(1, matched.length);
const priceHits = matched.filter((p) => { const s = d.items.find((i) => i.code === p.system); const t = labels.items.find((i) => i.code === p.truth); return s && t && s.price === t.price; }).length;
const speechItems = d.items.filter((i) => i.sources.speech).length;
const totalMs = Object.values(d.job.stages).reduce((s, v) => s + (v.ms ?? 0), 0);
console.log(JSON.stringify({
  job: code, truthItems: n, systemItems: d.items.length, matched: truthHit.size, missed: n - truthHit.size, ghosts,
  countAccuracy: Number(countAcc.toFixed(3)), titleAccuracy: Number(titleAcc.toFixed(3)), priceAccuracy: Number((priceHits / n).toFixed(3)),
  itemsUsingSpeech: speechItems, processingSec: Math.round(totalMs / 1000), costUsd: d.job.metrics.costUsd,
  pairs: data.pairs,
}, null, 2));
