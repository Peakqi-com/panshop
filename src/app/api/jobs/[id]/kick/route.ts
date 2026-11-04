import { after } from "next/server";
import { jobs } from "@/repositories/jobs";
import { pendingStage, triggerStage } from "@/lib/pipeline";
import { apiError } from "@/lib/api-error";

export const maxDuration = 60;

/**
 * 前端輪詢時發現有 stage 待跑卻沒人在跑，就打這支把它接起來。
 * 只會啟動「下一個待跑的 stage」，重複呼叫也不會跑兩次（run 內部有原子 claim）。
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await jobs.byId(id).catch(() => null);
  if (!job?._id) return apiError("找不到", "Not found", 404);
  const p = pendingStage(job);
  if (!p.stage) return Response.json({ kicked: null, running: p.running });
  const stage = p.stage;
  after(() => triggerStage(String(job._id), stage));
  return Response.json({ kicked: stage, stale: p.stale });
}
