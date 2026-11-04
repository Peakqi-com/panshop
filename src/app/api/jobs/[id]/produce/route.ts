import { after } from "next/server";
import { jobs } from "@/repositories/jobs";
import { items } from "@/repositories/items";
import { triggerStage } from "@/lib/pipeline";
import { guardJob } from "@/lib/owner";

/** 使用者按「建立目錄」：確認全部 draft，啟動 shoot → render */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await guardJob(id);
  if (job instanceof Response) return job;
  if (!["review", "done", "failed", "producing"].includes(job.status)) return Response.json({ error: "還在處理中" }, { status: 409 });
  await items.confirmAll(job._id!);
  await jobs.patch(job._id!, { status: "producing" });
  after(() => triggerStage(id, "shoot"));
  return Response.json({ ok: true });
}
