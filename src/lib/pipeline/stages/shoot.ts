import type { StageFn } from "@/lib/pipeline";
import { imageEdit } from "@/lib/meta";
import { putBlob } from "@/lib/blob";
import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { assets as assetRepo } from "@/repositories/assets";

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

  const one = async (it: (typeof todo)[number]) => {
    const refs = [...it.primaryCropUrls.slice(0, 3), ...(it.primaryCutoutUrl ? [it.primaryCutoutUrl] : [])];
    const subject = `${it.title || it.category}${it.color ? `, ${it.color}` : ""}${it.material ? `, ${it.material}` : ""}`;
    const base: Record<string, unknown> = { cutoutUrl: it.primaryCutoutUrl };
    try {
      const studio = await imageEdit({
        prompt: `Professional e-commerce product photo of exactly this item (${subject}), the same object as in the reference images with identical shape, color, pattern, labels and proportions. Centered, pure white seamless background, soft studio lighting, gentle contact shadow, no props, no text, no watermark, square format.`,
        images: refs, size: "1024x1024", format: "png",
      });
      usd += studio.usd;
      base.studioUrl = await putBlob(`jobs/${job.code}/items/${it.code}/studio.png`, studio.images[0]);
    } catch (e) {
      log(`${it.code} studio 失敗 ${(e as Error).message.slice(0, 120)}`);
    }
    try {
      const life = await imageEdit({
        prompt: `Lifestyle product photo of exactly this item (${subject}), same object as the reference images, in a tasteful real setting that fits the product (home, desk, cafe or outdoors as appropriate), natural light, shallow depth of field, no people, no text, no watermark, square format.`,
        images: refs, size: "1024x1024", format: "jpeg",
      });
      usd += life.usd;
      base.lifestyleUrl = await putBlob(`jobs/${job.code}/items/${it.code}/lifestyle.jpg`, life.images[0]);
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
    await Promise.all(todo.slice(i, i + CONCURRENCY).map(one));
  }
  await jobs.addCost(jobId, usd);
  return { note: `${list.length} 件商品圖` };
};
export default shoot;
