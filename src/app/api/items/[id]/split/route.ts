import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { items } from "@/repositories/items";
import { tracks } from "@/repositories/tracks";
import { ItemSchema, type Item } from "@/models/item";

/** 把一件拆成多件：每段 track 各成一件；只有一段的不能拆 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) return Response.json({ error: "id 不對" }, { status: 400 });
  const it = await items.byId(id);
  if (!it?._id) return Response.json({ error: "not found" }, { status: 404 });
  if (it.trackIds.length < 2) return Response.json({ error: "這件只有一段影像，不能拆" }, { status: 409 });
  const all = await tracks.forJob(it.jobId);
  const mine = it.trackIds.map((tid) => all.find((t) => String(t._id) === String(tid))).filter(Boolean);
  const siblings = await items.forJob(it.jobId, { includeDeleted: true });
  const letter = it.code.replace(/\d+$/, "");
  let n = Math.max(0, ...siblings.filter((s) => s.code.startsWith(letter)).map((s) => Number(s.code.slice(letter.length)) || 0));
  const now = new Date();
  const created: string[] = [];
  const db = await getDb();
  for (const [k, tr] of mine.entries()) {
    if (k === 0) { await items.setFields(it._id, { trackIds: [tr!._id!], primaryCropUrls: tr!.crops.map((c) => c.url).slice(0, 3), primaryCutoutUrl: tr!.cutouts[0]?.url, "userEdited.split": true }); continue; }
    n += 1;
    const doc: Omit<Item, "_id"> = ItemSchema.parse({
      ...it, _id: undefined, code: `${letter}${n}`, status: "draft", trackIds: [tr!._id!],
      primaryCropUrls: tr!.crops.map((c) => c.url).slice(0, 3), primaryCutoutUrl: tr!.cutouts[0]?.url, heroUrl: undefined,
      title: `${it.title}（${k + 1}）`, price: null, confidence: { title: 0.5, price: 0, overall: 0.5 }, userEdited: { split: true }, createdAt: now, updatedAt: now,
    });
    const r = await db.collection<Item>("items").insertOne(doc as Item);
    created.push(`${letter}${n}#${String(r.insertedId)}`);
  }
  return Response.json({ ok: true, created: created.map((c) => c.split("#")[0]) });
}
