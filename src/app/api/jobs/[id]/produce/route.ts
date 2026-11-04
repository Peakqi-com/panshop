import { after } from "next/server";
import { jobs } from "@/repositories/jobs";
import { items } from "@/repositories/items";
import { triggerStage } from "@/lib/pipeline";
import { guardJob } from "@/lib/owner";
import { checkTrial } from "@/lib/trial";
import { getLang } from "@/lib/i18n-server";
import { apiError } from "@/lib/api-error";

/** 使用者按「建立目錄」：確認全部 draft，啟動 shoot → render */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await guardJob(id);
  if (job instanceof Response) return job;
  const limited = await checkTrial(await getLang());
  if (limited) return Response.json({ error: limited.error }, { status: limited.status });
  if (!["review", "done", "failed", "producing"].includes(job.status)) return apiError("還在處理中", "Still processing", 409);
  await items.confirmAll(job._id!);
  await jobs.patch(job._id!, { status: "producing" });
  after(() => triggerStage(id, "shoot"));
  return Response.json({ ok: true });
}
