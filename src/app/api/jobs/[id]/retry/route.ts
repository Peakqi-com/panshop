import { after } from "next/server";
import { z } from "zod";
import { jobs } from "@/repositories/jobs";
import { triggerStage } from "@/lib/pipeline";
import { STAGES } from "@/lib/stages";

/** 從某個 stage 重跑（失敗後用） */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = z.object({ stage: z.enum(STAGES) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "stage 不對" }, { status: 400 });
  const job = await jobs.byId(id);
  if (!job?._id) return Response.json({ error: "not found" }, { status: 404 });
  await jobs.patch(job._id, { status: "processing" });
  after(() => triggerStage(id, body.data.stage));
  return Response.json({ ok: true });
}
