import { z } from "zod";
import { items } from "@/repositories/items";
import { guardItem } from "@/lib/owner";
import { assets } from "@/repositories/assets";

const Patch = z.object({
  caption: z.string().max(2000).optional(),
  captionShort: z.string().max(200).optional(),
  captionLong: z.string().max(4000).optional(),
  hook: z.string().max(60).optional(),
  voiceover: z.string().max(1000).optional(),
  sellingPoints: z.array(z.string().max(30)).max(3).optional(),
});

/** 產出頁可編輯的文案欄位 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guardItem(id);
  if (g instanceof Response) return g;
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "欄位不對" }, { status: 400 });
  const it = await items.byId(id);
  if (!it?._id) return Response.json({ error: "not found" }, { status: 404 });
  const a = await assets.byItem(it._id);
  // 卡片上改的開場一句同步到分鏡，短片實際讀的是分鏡
  const set = p.data.hook != null && a?.storyboard ? { ...p.data, storyboard: { ...a.storyboard, hook: p.data.hook } } : p.data;
  await assets.upsert(it._id, it.jobId, set);
  return Response.json({ ok: true });
}
