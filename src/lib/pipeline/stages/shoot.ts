import type { StageFn } from "@/lib/pipeline";
import { imageEdit, sparkJSON } from "@/lib/meta";
import { z } from "zod";
import { putBlob } from "@/lib/blob";
import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { assets as assetRepo } from "@/repositories/assets";
import { STYLES, SCENE_VARIATIONS, DEFAULT_STYLE, ANGLES, type StyleId } from "@/lib/config";
import type { Job } from "@/models/job";
import type { Item } from "@/models/item";

const Brief = z.object({
  subject: z.string().describe("一句英文精確描述這件商品：類型、形狀、材質、顏色、可見的標籤或圖案"),
  materialNotes: z.string().describe("英文，材質與表面對光的反應，例如 glossy enamel with speckles, soft matte ceramic"),
  scene: z.string().describe("英文，最適合這件商品的真實使用場景（地點、桌面、周邊環境），要符合風格"),
  props: z.string().describe("英文，兩到三個合理的搭配道具，不能喧賓奪主"),
  lighting: z.string().describe("英文，光線方向與質感"),
  palette: z.string().describe("英文，背景與道具的配色方向，要襯托商品的顏色"),
  shots: z.array(z.object({
    kind: z.enum(["front", "threeQuarter", "side", "lifestyle"]),
    camera: z.string().describe("英文，鏡位與焦段，例如 eye-level front view, 85mm, product fills 70% of frame"),
    scene: z.string().describe("英文，這一張的背景與擺放；棚拍三張要是乾淨白底，情境那張用上面的 scene"),
  })).describe("恰好四張：front、threeQuarter、side、lifestyle"),
});
type BriefT = z.infer<typeof Brief>;

const QA = z.object({
  ok: z.boolean().describe("生成圖裡的商品與參考圖是否為同一件（形狀、顏色、材質、把手或配件、標籤圖案都一致），且沒有多出文字、浮水印、人臉、第二件商品"),
  angleOk: z.boolean().describe("鏡位是否符合要求（例如要求正面就必須看到正面而不是側面）"),
  issues: z.array(z.string()).describe("不一致或角度不符的地方，英文短句，給重生時修正用；都沒問題就空陣列"),
  score: z.number().describe("0 到 1 的忠實度"),
});

/** 視覺簡報：Spark 看裁圖與品名，決定這件商品該怎麼拍（場景、道具、光線、四張的鏡位） */
async function writeBrief(it: Item, styleLabel: string, styleHint: string, refs: string[]): Promise<{ brief: BriefT; usd: number }> {
  const { data, usd } = await sparkJSON({
    schema: Brief, name: "visual_brief", effort: "low",
    system: "你是電商商品攝影的藝術指導。根據商品裁圖與資料，寫一份給生圖模型用的英文視覺簡報。棚拍三張一律乾淨白底、只換鏡位；情境那張要真實、不浮誇、道具不能搶戲；全部不得出現文字、人臉。",
    parts: [
      { text: `商品：${it.title || it.category}；品類 ${it.category}；顏色 ${it.color}；材質 ${it.material}；描述 ${it.description}。風格：${styleLabel}（${styleHint}）。` },
      ...refs.map((u) => ({ imageUrl: u })),
    ],
  });
  return { brief: data, usd };
}

/** 品管：Spark 比對生成圖與參考圖是不是同一件 */
async function qaShot(url: string, refs: string[], subject: string, angle: string): Promise<{ qa: z.infer<typeof QA>; usd: number }> {
  const { data, usd } = await sparkJSON({
    schema: QA, name: "shot_qa", effort: "low",
    system: "你是商品圖品管。第一張是生成圖，其餘是同一件商品的參考裁圖。兩件事：一、生成圖裡的商品是否與參考圖為同一件實體（同形狀、同顏色、同材質、同配件與圖案），有沒有多出文字、浮水印、人臉或第二件商品；二、鏡位是否符合要求。背景不同是正常的；角度不同如果是要求的就是正確的。",
    parts: [{ text: `商品：${subject}。要求的鏡位：${angle}。第一張是生成圖，之後是參考圖。` }, { imageUrl: url }, ...refs.map((u) => ({ imageUrl: u }))],
  });
  return { qa: data, usd };
}

/**
 * 單件商品圖：stage 與「重做這件」共用。
 * 流程：視覺簡報（可快取）→ 四張並行（三個棚拍角度加一張情境）→ 每張 Spark 品管，不合格帶著問題重生一次。
 * 全部用 Meta 模型，不接備援引擎。
 */
export async function shootItem(job: Job, it: Item, opts: { which: "studio" | "lifestyle" | "both"; variation?: number; hint?: string; style?: StyleId; log?: (m: string) => void }) {
  const log = opts.log ?? (() => {});
  const styleId = opts.style ?? ((job.style as StyleId) in STYLES ? (job.style as StyleId) : DEFAULT_STYLE);
  const style = STYLES[styleId];
  const refs = [...it.primaryCropUrls.slice(0, 3), ...(it.primaryCutoutUrl ? [it.primaryCutoutUrl] : [])];
  const prev = await assetRepo.byItem(it._id!);
  const history = [...(prev?.history ?? [])];
  const errors: string[] = [];
  const stamp = Date.now().toString(36);
  let usd = 0;

  let brief = prev?.brief as BriefT | undefined;
  if (!brief || opts.style) {
    try { const b = await writeBrief(it, style.label, style.hint, refs); brief = b.brief; usd += b.usd; }
    catch (e) { log(`${it.code} 視覺簡報失敗，用預設：${(e as Error).message.slice(0, 80)}`); }
  }
  const subject = brief?.subject ?? `${it.title || it.category}${it.color ? `, ${it.color}` : ""}${it.material ? `, ${it.material}` : ""}`;
  const briefShots = brief?.shots?.length === 4 ? brief.shots.map((sh) => ({ ...sh, camera: ANGLES.find((a) => a.kind === sh.kind)?.hint ?? sh.camera })) : null;
  const shotPlan = (briefShots ?? [
    ...ANGLES.map((a) => ({ kind: a.kind, camera: a.hint, scene: "seamless pure white background" })),
    { kind: "lifestyle", camera: "three-quarter view at eye level, 50mm, product occupies 55% of frame", scene: it.sceneHint || SCENE_VARIATIONS[(opts.variation ?? 0) % SCENE_VARIATIONS.length] },
  ]).filter((sh) => opts.which === "both" || (opts.which === "lifestyle" ? sh.kind === "lifestyle" : sh.kind !== "lifestyle"));
  const keep = (prev?.shots ?? []).filter((sh) => (opts.which === "studio" ? sh.kind === "lifestyle" : opts.which === "lifestyle" ? sh.kind !== "lifestyle" : false));

  const one = async (sh: { kind: string; camera: string; scene: string }) => {
    const isLife = sh.kind === "lifestyle";
    const label = isLife ? "情境" : (ANGLES.find((a) => a.kind === sh.kind)?.label ?? sh.kind);
    let fix = "";
    let best: { url: string; rank: number; qa: string } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const prompt = isLife ? lifestylePrompt(subject, brief, style.hint, sh, opts.hint, fix) : studioPrompt(subject, brief, sh, opts.hint, fix);
        const r = await imageEdit({ prompt, images: refs, size: "1024x1024", format: isLife ? "jpeg" : "png" });
        usd += r.usd;
        const url = await putBlob(`jobs/${job.code}/items/${stamp}/${it.code}/${sh.kind}${attempt ? "-r" : ""}.${isLife ? "jpg" : "png"}`, r.images[0]);
        const { qa, usd: qu } = await qaShot(url, refs.slice(0, 3), subject, isLife ? "lifestyle, any flattering angle" : sh.camera);
        usd += qu;
        const pass = qa.ok && (isLife || qa.angleOk);
        log(`${it.code} ${label} 第 ${attempt + 1} 次 品管 ${pass ? "通過" : "不通過"} 忠實 ${qa.score.toFixed(2)} 角度 ${qa.angleOk ? "對" : "錯"} ${qa.issues.join("; ").slice(0, 120)}`);
        const rank = qa.score + (pass ? 1 : 0);
        if (!best || rank > best.rank) best = { url, rank, qa: `${qa.score.toFixed(2)}|${pass ? "pass" : qa.issues.join("; ").slice(0, 160)}` };
        if (pass) break;
        fix = `The previous attempt was rejected: ${qa.issues.join("; ")}. ${!qa.angleOk ? `Rotate the camera so the view is exactly: ${sh.camera}` : ""} Keep the product identical and fix only these points.`;
      } catch (e) { errors.push(`${label}：${(e as Error).message.slice(0, 100)}`); break; }
    }
    return best ? { kind: sh.kind, label, url: best.url, qa: best.qa } : null;
  };
  const made = (await Promise.all(shotPlan.map(one))).filter(Boolean) as { kind: string; label: string; url: string; qa: string }[];
  for (const old of prev?.shots ?? []) if (!keep.includes(old) && made.some((m) => m.kind === old.kind)) history.push({ kind: old.kind, url: old.url, at: new Date() });
  const order = ["front", "threeQuarter", "side", "lifestyle"];
  const shots = [...keep, ...made].sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
  const set: Record<string, unknown> = {
    cutoutUrl: it.primaryCutoutUrl, shots, brief,
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
    const r = await shootItem(job, it, { which: "both", variation: idx, log });
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
/**
 * 忠實度規則分三層講：外型與比例、材質與表面、印刷文字與標籤，只准改場景。
 * 影像編輯模型最常犯的錯是「用同類商品的常見樣子重畫」，所以要把「不准換成同類別的另一件」講死。
 */
const FIDELITY = [
  "The product must be reproduced exactly from the reference images; it is the same physical item, not a similar one.",
  "(a) Shape and proportions: keep the exact silhouette, structure, handle or straps, and proportions. Never swap it for a different product of the same category and never add or remove parts.",
  "(b) Material and finish: keep the same material and surface, matte or glossy, texture, and how light reacts to it.",
  "(c) Printed artwork: keep any text, logo, pattern, stitching and label placement identical and legible. Do not redraw, translate or invent any text.",
  "Only the background, surface, props, camera angle, framing and lighting may change.",
].join(" ");
const NO_TEXT = "Do not add any text, letters, numbers, captions, watermarks, logos, stickers or graphics of your own; no people, no hands, no faces; exactly one product in frame; leave clean negative space around the product.";

function studioPrompt(subject: string, brief: BriefT | undefined, sh: { camera: string; scene: string }, hint?: string, fix = "") {
  return [
    `${sh.camera}`,
    `Professional e-commerce studio photograph of ${subject}. The camera has moved to the view described above; the product itself is unchanged.`,
    brief?.materialNotes ? `Material: ${brief.materialNotes}.` : "",
    `Background: seamless pure white, softbox lighting from the upper left with a soft fill, a gentle natural contact shadow under the product, true-to-life colors, sharp focus, square format.`,
    FIDELITY, NO_TEXT,
    hint ? `Additional direction from the seller: ${hint}.` : "",
    fix,
  ].filter(Boolean).join(" ");
}

function lifestylePrompt(subject: string, brief: BriefT | undefined, styleHint: string, sh: { camera: string; scene: string }, hint?: string, fix = "") {
  return [
    `Editorial lifestyle photograph of ${subject}.`,
    brief?.materialNotes ? `Material: ${brief.materialNotes}.` : "",
    `Scene: ${sh.scene || brief?.scene || "a real setting that fits the product"}.`,
    brief?.props ? `Props: ${brief.props}, kept secondary to the product.` : "",
    `Lighting: ${brief?.lighting || "soft natural window light"}.`,
    brief?.palette ? `Palette: ${brief.palette}.` : "",
    `Style: ${styleHint}.`,
    `Camera: ${sh.camera}.`,
    "Shallow depth of field, the product tack-sharp and clearly the hero, realistic photography, no illustration look, square format.",
    FIDELITY, NO_TEXT,
    hint ? `Additional direction from the seller: ${hint}.` : "",
    fix,
  ].filter(Boolean).join(" ");
}
