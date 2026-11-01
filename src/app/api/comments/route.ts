import { ObjectId } from "mongodb";
import { z } from "zod";
import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { comments } from "@/repositories/comments";
import { sparkOpenChat, extractJSON } from "@/lib/baseten";
import { sparkJSON } from "@/lib/meta";

const Body = z.object({ jobId: z.string(), text: z.string().min(1).max(300) });
const Out = z.object({ intent: z.enum(["price", "stock", "spec", "buy", "other"]), itemCode: z.string().nullable(), reply: z.string() });

/** Demo：留言對商品。先走開放權重 Muse Spark Open（Baseten），失敗退回 Muse Spark 1.3 */
export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "參數不對" }, { status: 400 });
  const job = ObjectId.isValid(p.data.jobId) ? await jobs.byId(p.data.jobId) : await jobs.byCode(p.data.jobId);
  if (!job?._id) return Response.json({ error: "not found" }, { status: 404 });
  const list = (await itemRepo.forJob(job._id)).filter((i) => i.status !== "deleted");
  const menu = list.map((i) => `${i.code}｜${i.title}｜${i.color}｜${i.price != null ? `${i.currency} ${i.price}` : "價格私訊"}`).join("\n");
  const system = `你是「${job.shopName || "本店"}」的小編。顧客在貼文留言，你要判斷意圖、對上商品代碼，並用繁體中文草擬一句親切的回覆（30 字內）。只能用下面清單裡的商品；對不上就 itemCode 為 null。只輸出 JSON：{"intent":"price|stock|spec|buy|other","itemCode":"A3 或 null","reply":"..."}`;
  const user = `商品清單：\n${menu}\n\n顧客留言：「${p.data.text}」`;
  const t0 = Date.now();
  let out: z.infer<typeof Out> | null = null, model = "";
  try {
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
