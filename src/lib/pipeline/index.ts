import type { ObjectId } from "mongodb";
import { jobs } from "@/repositories/jobs";
import { AUTO_STAGES, PRODUCE_STAGES, STAGES, type Job, type Stage } from "@/models/job";

export type StageContext = { job: Job; jobId: ObjectId; log: (msg: string) => void };
export type StageFn = (ctx: StageContext) => Promise<{ note?: string } | void>;

const impls: Partial<Record<Stage, () => Promise<{ default: StageFn }>>> = {
  extract: () => import("./stages/extract"),
  discover: () => import("./stages/discover"),
  segment: () => import("./stages/segment"),
  dedup: () => import("./stages/dedup"),
  transcribe: () => import("./stages/transcribe"),
  identify: () => import("./stages/identify"),
  shoot: () => import("./stages/shoot"),
  render: () => import("./stages/render"),
};

export function nextStage(stage: Stage, chain: Stage[]): Stage | null {
  const i = chain.indexOf(stage);
  return i >= 0 && i + 1 < chain.length ? chain[i + 1] : null;
}

export function chainOf(stage: Stage): Stage[] {
  return (PRODUCE_STAGES as Stage[]).includes(stage) ? PRODUCE_STAGES : AUTO_STAGES;
}

/** 跑一個 stage，寫狀態；回傳下一個該跑的 stage（沒有就 null） */
export async function runStage(jobIdStr: string, stage: Stage): Promise<{ ok: boolean; next: Stage | null; error?: string }> {
  if (!STAGES.includes(stage)) throw new Error(`未知 stage ${stage}`);
  const job = await jobs.byId(jobIdStr);
  if (!job?._id) throw new Error("job 不存在");
  const jobId = job._id;
  const loader = impls[stage];
  if (!loader) throw new Error(`stage ${stage} 尚未實作`);
  const started = Date.now();
  await jobs.setStage(jobId, stage, { status: "running", startedAt: new Date(), error: undefined });
  const chain = chainOf(stage);
  if (chain === AUTO_STAGES && job.status !== "processing") await jobs.patch(jobId, { status: "processing" });
  if (chain === PRODUCE_STAGES && job.status !== "producing") await jobs.patch(jobId, { status: "producing" });
  try {
    const { default: fn } = await loader();
    const fresh = (await jobs.byId(jobId))!;
    const r = await fn({ job: fresh, jobId, log: (m) => console.log(`[${job.code}][${stage}] ${m}`) });
    await jobs.setStage(jobId, stage, { status: "done", finishedAt: new Date(), ms: Date.now() - started, note: r?.note });
    const next = nextStage(stage, chain);
    if (!next) {
      await jobs.patch(jobId, { status: chain === AUTO_STAGES ? "review" : "done" });
    }
    return { ok: true, next };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${job.code}][${stage}] 失敗`, msg);
    await jobs.setStage(jobId, stage, { status: "failed", finishedAt: new Date(), ms: Date.now() - started, error: msg.slice(0, 2000) });
    await jobs.patch(jobId, { status: "failed" });
    return { ok: false, next: null, error: msg };
  }
}

/** 觸發下一個 stage：對自己的 API 發請求，讓每個 stage 各占一次函式呼叫 */
export async function triggerStage(jobId: string, stage: Stage) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const secret = process.env.WORKER_SECRET ?? "";
  const r = await fetch(`${base}/api/jobs/${jobId}/run`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-worker-secret": secret },
    body: JSON.stringify({ stage }),
  });
  if (!r.ok) console.error(`trigger ${stage} 失敗 ${r.status}`);
}
