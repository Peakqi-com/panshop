import { after } from "next/server";
import { jobs } from "@/repositories/jobs";
import { items } from "@/repositories/items";
import { triggerStage } from "@/lib/pipeline";

/** 使用者按「建立目錄」：確認全部 draft，啟動 shoot → render */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await jobs.byId(id);
  if (!job?._id) return Response.json({ error: "not found" }, { status: 404 });
  if (!["review", "done", "failed", "producing"].includes(job.status)) return Response.json({ error: "還在處理中" }, { status: 409 });
  await items.confirmAll(job._id);
  await jobs.patch(job._id, { status: "producing" });
  after(() => triggerStage(id, "shoot"));
  return Response.json({ ok: true });
}
