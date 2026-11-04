import { ObjectId } from "mongodb";
import { z } from "zod";
import { items } from "@/repositories/items";
import { guardItems } from "@/lib/owner";

/** 把多件合併成一件：留信心最高的那件，track 併過去，其餘標記刪除 */
export async function POST(req: Request) {
  const b = z.object({ ids: z.array(z.string()).min(2) }).safeParse(await req.json().catch(() => null));
  if (!b.success) return Response.json({ error: "至少選兩件" }, { status: 400 });
  const g = await guardItems(b.data.ids);
  if (g instanceof Response) return g;
  const docs = (await Promise.all(b.data.ids.filter((id) => ObjectId.isValid(id)).map((id) => items.byId(id)))).filter(Boolean);
  if (docs.length < 2) return Response.json({ error: "找不到商品" }, { status: 404 });
  const keep = [...docs].sort((a, b2) => b2!.confidence.overall - a!.confidence.overall)[0]!;
  const rest = docs.filter((d) => String(d!._id) !== String(keep._id));
  await items.setFields(keep._id!, {
    trackIds: [...keep.trackIds, ...rest.flatMap((r) => r!.trackIds)],
    price: keep.price ?? rest.find((r) => r!.price != null)?.price ?? null,
    primaryCropUrls: Array.from(new Set([...keep.primaryCropUrls, ...rest.flatMap((r) => r!.primaryCropUrls)])).slice(0, 6),
    sources: { vision: true, speech: keep.sources.speech || rest.some((r) => r!.sources.speech) },
    "userEdited.merged": true,
  });
  for (const r of rest) await items.setFields(r!._id!, { status: "deleted", title: `${r!.title}（併入 ${keep.code}）` });
  return Response.json({ ok: true, keep: keep.code, merged: rest.map((r) => r!.code) });
}
