import type { StageFn } from "@/lib/pipeline";
import { imageEdit } from "@/lib/meta";
import { putBlob } from "@/lib/blob";
import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { assets as assetRepo } from "@/repositories/assets";
import { STYLES, SCENE_VARIATIONS, DEFAULT_STYLE, type StyleId } from "@/lib/config";

const BUDGET_MS = 200_000;
const CONCURRENCY = 3;

/** stage 7：每件商品兩張圖。白底去背已在 segment 做好；這裡用 Muse Image 以商品自己的裁圖為參考生成棚拍圖與情境圖 */
const shoot: StageFn = async ({ job, jobId, log }) => {
  const t0 = Date.now();
  const list = (await itemRepo.forJob(jobId)).filter((i) => i.status === "confirmed");
  const done = new Set((await assetRepo.forJob(jobId)).filter((a) => a.studioUrl).map((a) => String(a.itemId)));
  const todo = list.filter((i) => !done.has(String(i._id)));
  if (!todo.length) return { note: `${list.length} 件商品圖` };
  let usd = 0, made = 0;

  const runId = Date.now().toString(36);
  const style = STYLES[(job.style as StyleId) in STYLES ? (job.style as StyleId) : DEFAULT_STYLE];

  const one = async (it: (typeof todo)[number], idx: number) => {
    const refs = [...it.primaryCropUrls.slice(0, 3), ...(it.primaryCutoutUrl ? [it.primaryCutoutUrl] : [])];
    const subject = `${it.title || it.category}${it.color ? `, ${it.color}` : ""}${it.material ? `, ${it.material}` : ""}`;
    const base: Record<string, unknown> = { cutoutUrl: it.primaryCutoutUrl };
    try {
      const studio = await imageEdit({ prompt: studioPrompt(subject), images: refs, size: "1024x1024", format: "png" });
      usd += studio.usd;
      base.studioUrl = await putBlob(`jobs/${job.code}/items/${runId}/${it.code}/studio.png`, studio.images[0]);
    } catch (e) {
      log(`${it.code} studio 失敗 ${(e as Error).message.slice(0, 120)}`);
    }
    try {
      const life = await imageEdit({ prompt: lifestylePrompt(subject, style.hint, it.sceneHint, SCENE_VARIATIONS[idx % SCENE_VARIATIONS.length]), images: refs, size: "1024x1024", format: "jpeg" });
      usd += life.usd;
      base.lifestyleUrl = await putBlob(`jobs/${job.code}/items/${runId}/${it.code}/lifestyle.jpg`, life.images[0]);
    } catch (e) {
      log(`${it.code} lifestyle 失敗 ${(e as Error).message.slice(0, 120)}`);
    }
    await assetRepo.upsert(it._id!, jobId, { ...base, status: "pending" });
    made++;
    log(`${it.code} 圖完成`);
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

function studioPrompt(subject: string) {
  return `Professional e-commerce product photo of ${subject}. ${FIDELITY} Centered on a seamless pure white background, soft studio lighting, gentle natural contact shadow, square format, sharp focus on the product.`;
}

function lifestylePrompt(subject: string, styleHint: string, sceneHint: string, variation: string) {
  return `Lifestyle product photo of ${subject}. ${FIDELITY} Style: ${styleHint}. ${sceneHint ? `Scene: ${sceneHint}. ` : ""}Composition: ${variation}. Square format, the product sharp and clearly the hero, leave some clean space around it.`;
}
