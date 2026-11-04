import { ObjectId } from "mongodb";
import { z } from "zod";
import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { comments } from "@/repositories/comments";
import { sparkOpenChat, extractJSON } from "@/lib/baseten";
import { sparkJSON } from "@/lib/meta";
import { settings } from "@/repositories/settings";
import { isEn, priceLabel, noPriceText } from "@/lib/video/lang";
import { apiError } from "@/lib/api-error";
import { parseOrderComment } from "@/lib/order-parse";
import { fmtPrice } from "@/lib/i18n";
import { checkTrial } from "@/lib/trial";
import { getLang } from "@/lib/i18n-server";

const Body = z.object({ jobId: z.string(), text: z.string().min(1).max(300) });
const Out = z.object({ intent: z.enum(["price", "stock", "spec", "buy", "other"]), itemCode: z.string().nullable(), reply: z.string() });

/**
 * 留言對商品：先用規則解析下單格式（A3+1、A3 x2、+1 A3，可多件、可帶買家名），不花模型額度；
 * 規則對不上的提問（A3 多少、還有藍色嗎）才交給開放權重 Muse Spark Open（Baseten），失敗退回 Muse Spark 1.3
 */
export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return apiError("參數不對", "Invalid request", 400);
  const job = ObjectId.isValid(p.data.jobId) ? await jobs.byId(p.data.jobId) : await jobs.byCode(p.data.jobId);
  if (!job?._id) return apiError("找不到", "Not found", 404);
  const list = (await itemRepo.forJob(job._id)).filter((i) => i.status !== "deleted");
  const en = isEn(job);
  const t0 = Date.now();

  // 1. 下單格式：規則解析
  const parsed = parseOrderComment(p.data.text, list.map((i) => i.code));
  if (parsed.lines.length) {
    const lines = parsed.lines.map((l) => {
      const it = list.find((i) => i.code === l.code)!;
      return { ...l, title: it.title, price: it.price, currency: it.currency };
    });
    const summary = lines.map((l) => `${l.code} ${l.title} ×${l.qty}`).join(en ? ", " : "、");
    const total = lines.every((l) => l.price != null) ? lines.reduce((s, l) => s + l.price! * l.qty, 0) : null;
    const cur = lines[0].currency;
    const reply = en
      ? `Got it${parsed.buyer ? `, ${parsed.buyer}` : ""}! ${summary}${total != null ? `, ${fmtPrice(total, cur)} in total` : ""}. We'll DM you payment and shipping details.`
      : `收到${parsed.buyer ? ` ${parsed.buyer}` : ""}！${summary}${total != null ? `，共 ${fmtPrice(total, cur)}` : ""}，稍後私訊付款與出貨資訊。`;
    const first = list.find((i) => i.code === lines[0].code)!;
    const doc = await comments.create({ jobId: job._id, text: p.data.text, intent: "buy", itemCode: first.code, itemId: first._id ?? null, reply, model: "rule", ms: Date.now() - t0, buyer: parsed.buyer, lines: parsed.lines });
    return Response.json({ intent: "buy", itemCode: first.code, itemTitle: first.title, reply, model: "rule", ms: doc.ms, buyer: parsed.buyer, lines });
  }

  // 2. 其他提問：模型判斷意圖與回覆
  const limited = await checkTrial(await getLang(), { newJob: false });
  if (limited) return Response.json({ error: limited.error }, { status: limited.status });
  const menu = en
    ? list.map((i) => `${i.code}｜${i.title}｜${i.color}｜${i.price != null ? priceLabel(i.price, i.currency, true) : noPriceText(true)}`).join("\n")
    : list.map((i) => `${i.code}｜${i.title}｜${i.color}｜${i.price != null ? fmtPrice(i.price, i.currency) : "價格私訊"}`).join("\n");
  const system = en
    ? `You are the social media manager of "${job.shopName || "our shop"}". A customer commented on a post. Classify the intent, match it to a product code, and draft one friendly reply (max 20 words) in the same language as the comment (English if unsure). Only use products from the list below; if none matches, itemCode is null. Output JSON only: {"intent":"price|stock|spec|buy|other","itemCode":"A3 or null","reply":"..."}`
    : `你是「${job.shopName || "本店"}」的小編。顧客在貼文留言，你要判斷意圖、對上商品代碼，並用繁體中文草擬一句親切的回覆（30 字內）。只能用下面清單裡的商品；對不上就 itemCode 為 null。只輸出 JSON：{"intent":"price|stock|spec|buy|other","itemCode":"A3 或 null","reply":"..."}`;
  const user = en ? `Products:\n${menu}\n\nCustomer comment: "${p.data.text}"` : `商品清單：\n${menu}\n\n顧客留言：「${p.data.text}」`;
  let out: z.infer<typeof Out> | null = null, model = "";
  const cfg = await settings.get();
  if (cfg.commentModel === "spark-open") try {
    const r = await sparkOpenChat({ system, user, maxTokens: 1500 });
    const j = extractJSON(r.text);
    const v = Out.safeParse(j);
    if (v.success) { out = v.data; model = r.model; }
  } catch (e) {
    console.warn("baseten 失敗，退回 spark", (e as Error).message);
  }
  if (!out) {
    const r = await sparkJSON({ schema: Out, name: "comment", system, parts: [{ text: user }], effort: "minimal" });
    out = r.data; model = "muse-spark-1.3";
  }
  const item = out.itemCode ? list.find((i) => i.code.toUpperCase() === out!.itemCode!.toUpperCase()) : undefined;
  const doc = await comments.create({ jobId: job._id, text: p.data.text, intent: out.intent, itemCode: item?.code ?? null, itemId: item?._id ?? null, reply: out.reply, model, ms: Date.now() - t0 });
  return Response.json({ intent: out.intent, itemCode: item?.code ?? null, itemTitle: item?.title ?? null, reply: out.reply, model, ms: doc.ms });
}
