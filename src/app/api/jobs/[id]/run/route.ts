import { after } from "next/server";
import { checkWorkerSecret } from "@/lib/auth";
import { runStage, triggerStage } from "@/lib/pipeline";
import { STAGES, type Stage } from "@/models/job";

export const maxDuration = 300;

/** 跑一個 stage；完成後在背景觸發下一個。只接受帶 WORKER_SECRET 的請求 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkWorkerSecret(req.headers.get("x-worker-secret"))) return new Response("forbidden", { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { stage?: string; chain?: boolean };
  const stage = body.stage as Stage;
  if (!STAGES.includes(stage)) return Response.json({ error: "stage 不對" }, { status: 400 });
  const r = await runStage(id, stage);
  if (r.ok && r.next && body.chain !== false) {
    const next = r.next;
    after(() => triggerStage(id, next));
  }
  return Response.json(r);
}
