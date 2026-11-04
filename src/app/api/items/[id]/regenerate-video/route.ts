import { items } from "@/repositories/items";
import { guardItem } from "@/lib/owner";
import { checkTrial } from "@/lib/trial";
import { getLang } from "@/lib/i18n-server";
import { jobs } from "@/repositories/jobs";
import { assets } from "@/repositories/assets";
import { tracks } from "@/repositories/tracks";
import { renderItem } from "@/lib/pipeline/stages/render";
import { apiError } from "@/lib/api-error";

export const maxDuration = 300;

/** 重做單件商品的形象短片（文案或圖改了之後用） */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guardItem(id);
  if (g instanceof Response) return g;
  const limited = await checkTrial(await getLang());
  if (limited) return Response.json({ error: limited.error }, { status: limited.status });
  const it = await items.byId(id);
  if (!it?._id) return apiError("找不到", "Not found", 404);
  const [job, a, trs] = await Promise.all([jobs.byId(it.jobId), assets.byItem(it._id), tracks.forJob(it.jobId)]);
  if (!job?._id || !a) return apiError("還沒有產出資料", "Nothing has been produced yet", 409);
  const spans = it.trackIds.map((tid) => trs.find((t) => String(t._id) === String(tid))).filter(Boolean).map((t) => [t!.startSec, t!.endSec] as const);
  const r = await renderItem(job, it, a, spans, (m) => console.log(`[${job.code}][regen-video] ${m}`));
  return Response.json(r, { status: r.ok ? 200 : 500 });
}
