/**
 * 短片分鏡：Spark 先寫腳本（鉤子、場景、旁白含語氣指令、字幕、鏡頭運動、每場用哪張圖），
 * 場景圖優先用已生成的商品圖，需要新畫面才用 Muse Image 生。編輯面板的單場重做也走這裡。
 */
import { z } from "zod";
import { sparkJSON, imageEdit } from "@/lib/meta";
import { putBlob } from "@/lib/blob";
import type { Job } from "@/models/job";
import type { Item } from "@/models/item";
import type { Asset } from "@/models/asset";
import { STYLES, type StyleId } from "@/lib/config";
import { isEn, withLang, priceLabel, noPriceText, ctaText } from "./lang";
import { STYLE_LABEL_EN } from "@/lib/i18n";

export const MOTIONS = ["push_in", "pull_out", "pan_left", "pan_right", "drift_up", "orbit"] as const;
export const Storyboard = z.object({
  hook: z.string().describe("開頭一句鉤子，10 字內，繁體中文"),
  cta: z.string().describe("結尾行動呼籲，例如 留言 A3 取得連結"),
  scenes: z.array(z.object({
    sceneNo: z.number().int(),
    durationSec: z.number().describe("3 到 5 秒"),
    purpose: z.enum(["hook", "hero", "detail", "use", "close"]),
    shot: z.enum(["front", "threeQuarter", "side", "lifestyle", "generate"]).describe("這一場用哪張既有商品圖；需要新畫面（例如特寫材質、使用情境）才填 generate"),
    imagePrompt: z.string().describe("shot 為 generate 時給生圖模型的英文畫面描述（角度、距離、場景、光線），不含文字；否則空字串"),
    motion: z.enum(MOTIONS),
    narration: z.string().describe("口語旁白，繁體中文，句首可加一個方括號語氣提示例如 [溫暖、放慢]；長度要能在 durationSec 內念完（每秒約 4 個字）"),
    subtitle: z.string().describe("畫面字幕，18 字內，不含語氣提示"),
    overlay: z.enum(["none", "headline", "price", "cta"]).describe("hook 場用 headline，close 場用 price 或 cta，其餘 none"),
  })).min(4).max(5),
});
export type StoryboardT = z.infer<typeof Storyboard>;
export type SceneWithImage = StoryboardT["scenes"][number] & { imageUrl?: string };

export async function writeStoryboard(job: Job, it: Item, a: Asset): Promise<{ sb: StoryboardT; usd: number }> {
  const style = STYLES[(job.style as StyleId) in STYLES ? (job.style as StyleId) : "lifestyle"];
  const have = (a.shots ?? []).map((s) => s.kind);
  const en = isEn(job);
  const { data, usd } = await sparkJSON({
    schema: Storyboard, name: "storyboard", effort: "medium", maxTokens: 5000,
    system: en
      ? withLang(`You are a short-form video ad director writing a 15–20 second vertical product video storyboard for a small seller's single item. Style: "${STYLE_LABEL_EN[job.style] ?? style.label}". Rules: lead with the payoff; narration is spoken, specific and not hyped, and may only state facts visible in the images or given in the data — never invent certifications, effects, spec numbers or discounts; scene 1 is the hook (use the best-looking image, overlay headline); the middle 2–3 scenes cover material, details and use; the last scene (close) shows price and call to action ("${ctaText(it.code, true)}"); do not repeat camera motions; subtitles mean the same as the narration but shorter (max ~8 words); narration may start with one bracketed tone cue like [warm, slow] and must fit the scene duration at about 2.5 words per second; say prices naturally ("nineteen eighty", or "${it.price != null ? priceLabel(it.price, job.currency, true) : noPriceText(true)}" on screen); prefer existing product images and use generate only when a new view is really needed.`, true)
      : `你是台灣短影音廣告導演，替小賣家的單件商品寫 15 到 20 秒的直式形象短片分鏡。風格「${style.label}」。規則：結論先講；旁白口語、具體、不浮誇，只能講畫面與資料裡看得到的事實，不得捏造認證、功效、規格數字與優惠；第一場是 hook（用最好看的那張圖，overlay 用 headline），中間 2 到 3 場講材質、細節、使用情境，最後一場 close 顯示價格與行動呼籲；每場鏡頭運動不要重複；字幕要和旁白同義但更短；價格用自然念法（一千九百八十元），不要逐字念數字；已有的商品圖優先使用，只有確實需要新畫面才用 generate。`,
    parts: [
      { text: `商品 ${it.code}：${it.title}；品類 ${it.category}；顏色 ${it.color}；材質 ${it.material}；價格 ${it.price != null ? `${job.currency} ${it.price}` : "未定，旁白說價格請私訊"}；描述：${it.description}；賣點：${(a.sellingPoints ?? []).join("、")}。店名「${job.shopName || "本店"}」。已有的商品圖：${have.join("、") || "無"}。${a.brief ? `視覺簡報：${a.brief.subject}；場景 ${a.brief.scene}。` : ""}` },
      ...(a.shots ?? []).slice(0, 4).map((s) => ({ imageUrl: s.url })),
    ],
  });
  // 保險：時長與場數
  data.scenes = data.scenes.slice(0, 5).map((s, i) => ({ ...s, sceneNo: i + 1, durationSec: Math.max(3, Math.min(5, s.durationSec || 4)) }));
  return { sb: data, usd };
}

/** 把每一場需要的圖準備好：既有商品圖直接用，generate 的用 Muse Image 生 */
export async function ensureSceneImages(job: Job, it: Item, a: Asset, sb: StoryboardT, log: (m: string) => void): Promise<{ scenes: SceneWithImage[]; usd: number }> {
  const shots = a.shots ?? [];
  const pick = (k: string) => shots.find((s) => s.kind === k)?.url;
  const stamp = Date.now().toString(36);
  let usd = 0;
  const scenes: SceneWithImage[] = [];
  for (const sc of sb.scenes) {
    let url = sc.shot === "generate" ? undefined : pick(sc.shot);
    if (!url && sc.shot !== "generate") url = pick("threeQuarter") ?? pick("lifestyle") ?? shots[0]?.url;
    if (!url || sc.shot === "generate") {
      try {
        const r = await generateSceneImage(job, it, a, sc.sceneNo, sc.imagePrompt || sc.subtitle, stamp);
        usd += r.usd; url = r.url;
        log(`${it.code} 場景 ${sc.sceneNo} 生成`);
      } catch (e) {
        log(`${it.code} 場景 ${sc.sceneNo} 生成失敗，改用既有圖：${(e as Error).message.slice(0, 80)}`);
        url = pick("lifestyle") ?? pick("threeQuarter") ?? shots[0]?.url;
      }
    }
    scenes.push({ ...sc, imageUrl: url });
  }
  return { scenes, usd };
}

/** 生一張場景圖：參考原片裁圖，商品要和原品一致，場景與構圖照描述 */
export async function generateSceneImage(job: Job, it: Item, a: Asset, sceneNo: number, description: string, stamp = Date.now().toString(36)) {
  const refs = [...it.primaryCropUrls.slice(0, 3), ...(it.primaryCutoutUrl ? [it.primaryCutoutUrl] : [])];
  const prompt = [
    `Cinematic product scene for a vertical video: ${description}.`,
    a.brief ? `The product: ${a.brief.subject}. Material: ${a.brief.materialNotes}.` : `The product: ${it.title}.`,
    "The product must be reproduced exactly from the reference images (same shape, color, material, parts and printed artwork); only the scene, framing and lighting change.",
    "Realistic photography, shallow depth of field, soft directional light, portrait 9:16 framing with the product in the central area and clean space above and below for captions.",
    "No text, letters, numbers, logos, watermarks, people or faces.",
  ].join(" ");
  const r = await imageEdit({ prompt, images: refs, size: "1024x1792", format: "jpeg" });
  const url = await putBlob(`jobs/${job.code}/items/${stamp}/${it.code}/scene${sceneNo}.jpg`, r.images[0]);
  return { url, usd: r.usd };
}

const SceneText = z.object({
  narration: z.string().describe("口語旁白，繁體中文，句首可加一個方括號語氣提示；每秒約 4 個字"),
  subtitle: z.string().describe("畫面字幕，18 字內，不含語氣提示"),
  imagePrompt: z.string().describe("這一場畫面的英文描述（角度、距離、場景、光線），不含文字"),
});

/** 只重寫一場的文字，其他場當上下文，不動它們 */
export async function rewriteSceneText(job: Job, it: Item, a: Asset, sb: { hook: string; scenes: { sceneNo: number; purpose: string; narration: string; durationSec: number }[] }, sceneNo: number, hint: string) {
  const target = sb.scenes.find((s) => s.sceneNo === sceneNo);
  if (!target) throw new Error("沒有這一場");
  return sparkJSON({
    schema: SceneText, name: "scene_text", effort: "low", maxTokens: 1500,
    system: withLang("你是台灣短影音廣告導演，只重寫指定的一場。旁白口語、具體、不浮誇，只能講資料裡有的事實，不得捏造認證、功效、規格數字與優惠；價格用自然念法；不要和其他場重複。", isEn(job)),
    parts: [{ text: `商品 ${it.code}：${it.title}；顏色 ${it.color}；材質 ${it.material}；價格 ${it.price != null ? `${job.currency} ${it.price}` : "未定"}；描述：${it.description}；賣點：${(a.sellingPoints ?? []).join("、")}。\n分鏡：\n${sb.scenes.map((s) => `第 ${s.sceneNo} 場（${s.purpose}）：${s.narration}`).join("\n")}\n請重寫第 ${sceneNo} 場，長度 ${target.durationSec} 秒。${hint ? `賣家的方向：${hint}` : ""}` }],
  });
}
