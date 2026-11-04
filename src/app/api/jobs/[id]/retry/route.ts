import { after } from "next/server";
import { z } from "zod";
import { jobs } from "@/repositories/jobs";
import { triggerStage } from "@/lib/pipeline";
import { STAGES, AUTO_STAGES, PRODUCE_STAGES } from "@/lib/stages";
import { isAdmin } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

/** 從某個 stage 重跑（失敗後用） */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return apiError("需要管理員登入（/admin）", "Admin sign-in required (/admin)", 403);
  const { id } = await params;
  const body = z.object({ stage: z.enum(STAGES) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("stage 不對", "Invalid stage", 400);
  const job = await jobs.byId(id);
  if (!job?._id) return apiError("找不到", "Not found", 404);
  const chain = (PRODUCE_STAGES as string[]).includes(body.data.stage) ? PRODUCE_STAGES : AUTO_STAGES;
  const from = chain.indexOf(body.data.stage);
  const reset: Record<string, unknown> = { status: chain === AUTO_STAGES ? "processing" : "producing" };
  for (const st of chain.slice(from)) reset[`stages.${st}`] = { status: "pending" };
  await jobs.patch(job._id, reset);
  after(() => triggerStage(id, body.data.stage));
  return Response.json({ ok: true });
}
