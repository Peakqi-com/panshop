import type { StageFn } from "@/lib/pipeline";
import { imageEdit } from "@/lib/meta";
import { putBlob } from "@/lib/blob";
import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { assets as assetRepo } from "@/repositories/assets";
import { STYLES, SCENE_VARIATIONS, DEFAULT_STYLE, ANGLES, type StyleId } from "@/lib/config";
import type { Job } from "@/models/job";
import type { Item } from "@/models/item";

/**
 * 單件商品圖：stage 與「重做這件」共用。棚拍三個角度（正面、四十五度、側面）加一張情境圖，四張同時生成。
 * hint 是使用者給的一句方向。舊圖進 history。
 */
export async function shootItem(job: Job, it: Item, opts: { which: "studio" | "lifestyle" | "both"; variation?: number; hint?: string; style?: StyleId }) {
  const styleId = opts.style ?? ((job.style as StyleId) in STYLES ? (job.style as StyleId) : DEFAULT_STYLE);
  const style = STYLES[styleId];
  const refs = [...it.primaryCropUrls.slice(0, 3), ...(it.primaryCutoutUrl ? [it.primaryCutoutUrl] : [])];
  const subject = `${it.title || it.category}${it.color ? `, ${it.color}` : ""}${it.material ? `, ${it.material}` : ""}`;
  const prev = await assetRepo.byItem(it._id!);
  const history = [...(prev?.history ?? [])];
  const errors: string[] = [];
  const stamp = Date.now().toString(36);
  let usd = 0;
  const keep = (prev?.shots ?? []).filter((sh) => (opts.which === "studio" ? sh.kind === "lifestyle" : opts.which === "lifestyle" ? sh.kind !== "lifestyle" : false));
  const tasks: Promise<{ kind: string; label: string; url: string } | null>[] = [];
  if (opts.which !== "lifestyle") for (const a of ANGLES) tasks.push((async () => {
    try {
      const r = await imageEdit({ prompt: studioPrompt(subject, a.hint, opts.hint), images: refs, size: "1024x1024", format: "png" });
      usd += r.usd;
      return { kind: a.kind, label: a.label, url: await putBlob(`jobs/${job.code}/items/${stamp}/${it.code}/${a.kind}.png`, r.images[0]) };
    } catch (e) { errors.push(`${a.label}：${(e as Error).message.slice(0, 100)}`); return null; }
  })());
  if (opts.which !== "studio") tasks.push((async () => {
    try {
      const r = await imageEdit({ prompt: lifestylePrompt(subject, style.hint, it.sceneHint, SCENE_VARIATIONS[(opts.variation ?? 0) % SCENE_VARIATIONS.length], opts.hint), images: refs, size: "1024x1024", format: "jpeg" });
      usd += r.usd;
      return { kind: "lifestyle", label: "情境", url: await putBlob(`jobs/${job.code}/items/${stamp}/${it.code}/lifestyle.jpg`, r.images[0]) };
    } catch (e) { errors.push(`情境圖：${(e as Error).message.slice(0, 100)}`); return null; }
  })());
  const made = (await Promise.all(tasks)).filter(Boolean) as { kind: string; label: string; url: string }[];
  for (const old of prev?.shots ?? []) if (!keep.includes(old) && made.some((m) => m.kind === old.kind)) history.push({ kind: old.kind, url: old.url, at: new Date() });
  const order = ["front", "threeQuarter", "side", "lifestyle"];
  const shots = [...keep, ...made].sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
  const set: Record<string, unknown> = {
    cutoutUrl: it.primaryCutoutUrl, shots,
    studioUrl: shots.find((sh) => sh.kind === "threeQuarter")?.url ?? shots.find((sh) => sh.kind === "front")?.url ?? prev?.studioUrl,
    lifestyleUrl: shots.find((sh) => sh.kind === "lifestyle")?.url ?? prev?.lifestyleUrl,
  };
  await assetRepo.upsert(it._id!, job._id!, { ...set, history: history.slice(-16), status: prev?.status ?? "pending" });
  return { usd, errors, set };
}

const BUDGET_MS = 200_000;
const CONCURRENCY = 2;  // 每件同時出 4 張，兩件並行就是 8 個請求

/** stage 7：每件商品兩張圖。白底去背已在 segment 做好；這裡用 Muse Image 以商品自己的裁圖為參考生成棚拍圖與情境圖 */
const shoot: StageFn = async ({ job, jobId, log }) => {
  const t0 = Date.now();
  const list = (await itemRepo.forJob(jobId)).filter((i) => i.status === "confirmed");
  const done = new Set((await assetRepo.forJob(jobId)).filter((a) => a.studioUrl).map((a) => String(a.itemId)));
  const todo = list.filter((i) => !done.has(String(i._id)));
  if (!todo.length) return { note: `${list.length} 件商品圖` };
  let usd = 0, made = 0;

  const one = async (it: (typeof todo)[number], idx: number) => {
    const r = await shootItem(job, it, { which: "both", variation: idx });
    usd += r.usd;
    made++;
    log(`${it.code} 圖完成${r.errors.length ? `（${r.errors.join("；")}）` : ""}`);
  };

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    if (Date.now() - t0 > BUDGET_MS) {
      await jobs.addCost(jobId, usd);
      return { note: `商品圖 ${list.length - todo.length + made}/${list.length}，繼續…`, again: true };
    }
    await Promise.all(todo.slice(i, i + CONCURRENCY).map((it, k) => one(it, i + k)));
  }
  await jobs.addCost(jobId, usd);
  return { note: `${list.length} 件商品圖` };
};
export default shoot;

/**
 * 忠實度規則分三層講：外型與比例、材質與表面、印刷文字與標籤，只准改場景。
 * 影像編輯模型最常犯的錯是「用同類商品的常見樣子重畫」，所以要把「不准換成同類別的另一件」講死。
 */
const FIDELITY = [
  "The product must be reproduced exactly from the reference images; it is the same physical item.",
  "(a) Shape and proportions: keep the exact silhouette, structure and proportions. Never swap it for a different product of the same category.",
  "(b) Material and finish: keep the same material and surface, matte or glossy, and how light reacts to it.",
  "(c) Printed artwork: keep any text, logo, pattern, label and color placement identical and legible. Do not redraw, translate or invent any text.",
  "Only the background, surface, props, framing and lighting may change.",
  "Do not add any new text, captions, watermarks or graphics. No people's faces.",
].join(" ");

function studioPrompt(subject: string, angle: string, hint?: string) {
  return `Professional e-commerce product photo of ${subject}, ${angle}. ${FIDELITY} The product is exactly the same object as in the reference images, only the camera angle changes. Centered on a seamless pure white background, soft studio lighting, gentle natural contact shadow, square format, sharp focus on the product.${hint ? ` Additional direction from the seller: ${hint}.` : ""}`;
}

function lifestylePrompt(subject: string, styleHint: string, sceneHint: string, variation: string, hint?: string) {
  return `Lifestyle product photo of ${subject}. ${FIDELITY} Style: ${styleHint}. ${sceneHint ? `Scene: ${sceneHint}. ` : ""}Composition: ${variation}.${hint ? ` Additional direction from the seller: ${hint}.` : ""} Square format, the product sharp and clearly the hero, leave some clean space around it.`;
}
