import { after } from "next/server";
import { checkWorkerSecret } from "@/lib/auth";
import { runAndChain } from "@/lib/pipeline";
import { STAGES, type Stage } from "@/lib/stages";

export const maxDuration = 800; // Pro 方案上限；segment 與 render 最耗時

/**
 * 排隊跑一個 stage：立刻回 202，實際在 after() 裡跑並接續下一個。
 * 只接受帶 WORKER_SECRET 的請求（上一個 stage、Cron、kick 都走內部呼叫）。
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkWorkerSecret(req.headers.get("x-worker-secret"))) return new Response("forbidden", { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { stage?: string; sync?: boolean };
  const stage = body.stage as Stage;
  if (!STAGES.includes(stage)) return Response.json({ error: "stage 不對" }, { status: 400 });
  if (body.sync) return Response.json(await runAndChain(id, stage));
  after(() => runAndChain(id, stage));
  return Response.json({ queued: stage }, { status: 202 });
}
