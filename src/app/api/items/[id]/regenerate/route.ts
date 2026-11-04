import { z } from "zod";
import { items } from "@/repositories/items";
import { guardItem } from "@/lib/owner";
import { checkTrial } from "@/lib/trial";
import { getLang } from "@/lib/i18n-server";
import { jobs } from "@/repositories/jobs";
import { shootItem } from "@/lib/pipeline/stages/shoot";
import { STYLES, type StyleId } from "@/lib/config";
import { apiError } from "@/lib/api-error";

export const maxDuration = 180;

const Body = z.object({
  which: z.enum(["studio", "lifestyle", "both"]).default("both"),
  hint: z.string().max(200).optional(),
  style: z.string().optional(),
});

/** 重做單件商品圖，可帶一句方向與風格 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guardItem(id);
  if (g instanceof Response) return g;
  const limited = await checkTrial(await getLang());
  if (limited) return Response.json({ error: limited.error }, { status: limited.status });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return apiError("參數不對", "Invalid request", 400);
  const it = await items.byId(id);
  if (!it?._id) return apiError("找不到", "Not found", 404);
  const job = await jobs.byId(it.jobId);
  if (!job?._id) return apiError("找不到", "Not found", 404);
  const style = b.data.style && b.data.style in STYLES ? (b.data.style as StyleId) : undefined;
  const r = await shootItem(job, it, { which: b.data.which, hint: b.data.hint?.trim() || undefined, style, variation: Math.floor(Math.random() * 6), log: (m) => console.log(`[${job.code}][regen] ${m}`) });
  await jobs.addCost(job._id, r.usd);
  return Response.json({ ok: r.errors.length === 0, errors: r.errors, ...r.set });
}
