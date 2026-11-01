import { ObjectId } from "mongodb";
import { z } from "zod";
import { items } from "@/repositories/items";
import { assets } from "@/repositories/assets";

const Patch = z.object({
  caption: z.string().max(2000).optional(),
  hook: z.string().max(60).optional(),
  voiceover: z.string().max(1000).optional(),
  sellingPoints: z.array(z.string().max(30)).max(3).optional(),
});

/** 產出頁可編輯的文案欄位 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) return Response.json({ error: "id 不對" }, { status: 400 });
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "欄位不對" }, { status: 400 });
  const it = await items.byId(id);
  if (!it?._id) return Response.json({ error: "not found" }, { status: 404 });
  await assets.upsert(it._id, it.jobId, p.data);
  return Response.json({ ok: true });
}
