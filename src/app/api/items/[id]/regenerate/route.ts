import { ObjectId } from "mongodb";
import { z } from "zod";
import { items } from "@/repositories/items";
import { jobs } from "@/repositories/jobs";
import { shootItem } from "@/lib/pipeline/stages/shoot";
import { STYLES, type StyleId } from "@/lib/config";

export const maxDuration = 180;

const Body = z.object({
  which: z.enum(["studio", "lifestyle", "both"]).default("both"),
  hint: z.string().max(200).optional(),
  style: z.string().optional(),
});

/** 重做單件商品圖，可帶一句方向與風格 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) return Response.json({ error: "id 不對" }, { status: 400 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return Response.json({ error: "參數不對" }, { status: 400 });
  const it = await items.byId(id);
  if (!it?._id) return Response.json({ error: "not found" }, { status: 404 });
  const job = await jobs.byId(it.jobId);
  if (!job?._id) return Response.json({ error: "job not found" }, { status: 404 });
  const style = b.data.style && b.data.style in STYLES ? (b.data.style as StyleId) : undefined;
  const r = await shootItem(job, it, { which: b.data.which, hint: b.data.hint?.trim() || undefined, style, variation: Math.floor(Math.random() * 6), log: (m) => console.log(`[${job.code}][regen] ${m}`) });
  await jobs.addCost(job._id, r.usd);
  return Response.json({ ok: r.errors.length === 0, errors: r.errors, ...r.set });
}
