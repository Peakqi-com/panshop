import https from "node:https";
import http from "node:http";
import { ObjectId } from "mongodb";
import { jobs } from "@/repositories/jobs";
import { getDb } from "@/lib/db";
import { AUTO_STAGES, PRODUCE_STAGES, STAGES, type Job, type Stage } from "@/models/job";

export type StageContext = { job: Job; jobId: ObjectId; log: (msg: string) => void };
/** again=true 表示這個 stage 還沒做完（時間用完），要再被呼叫一次繼續 */
export type StageFn = (ctx: StageContext) => Promise<{ note?: string; again?: boolean } | void>;

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

const STALE_MS = 15 * 60_000; // running 超過這麼久視為函式中途死掉

export function nextStage(stage: Stage, chain: Stage[]): Stage | null {
  const i = chain.indexOf(stage);
  return i >= 0 && i + 1 < chain.length ? chain[i + 1] : null;
}

export function chainOf(stage: Stage): Stage[] {
  return (PRODUCE_STAGES as Stage[]).includes(stage) ? PRODUCE_STAGES : AUTO_STAGES;
}

/** 依 job 狀態決定現在該跑哪一條鏈 */
export function chainForJob(job: Job): Stage[] | null {
  if (job.status === "uploaded" || job.status === "processing") return AUTO_STAGES;
  if (job.status === "producing") return PRODUCE_STAGES;
  return null;
}

/** 這個 job 下一個該跑的 stage；有 stage 正在跑就回 null（除非已經卡死） */
export function pendingStage(job: Job): { stage: Stage | null; running: Stage | null; stale: boolean } {
  const chain = chainForJob(job);
  if (!chain) return { stage: null, running: null, stale: false };
  for (const s of chain) {
    const st = job.stages[s];
    if (st?.status === "running") {
      const started = st.startedAt ? new Date(st.startedAt).getTime() : 0;
      const stale = Date.now() - started > STALE_MS;
      return { stage: stale ? s : null, running: s, stale };
    }
    if (st?.status === "done" || st?.status === "skipped") continue;
    return { stage: s, running: null, stale: false };
  }
  return { stage: null, running: null, stale: false };
}

/**
 * 原子地把 stage 標成 running；同一個 stage 已在跑或已完成就回 false。
 * Cron、前端 kick、上一個 stage 的直接呼叫可能同時到，靠這個避免跑兩次。
 */
async function claim(jobId: ObjectId, stage: Stage): Promise<boolean> {
  const db = await getDb();
  const r = await db.collection("jobs").updateOne(
    { _id: jobId, $or: [{ [`stages.${stage}.status`]: { $nin: ["running", "done"] } }, { [`stages.${stage}.status`]: "running", [`stages.${stage}.startedAt`]: { $lt: new Date(Date.now() - STALE_MS) } }] },
    { $set: { [`stages.${stage}`]: { status: "running", startedAt: new Date() }, updatedAt: new Date() } },
  );
  return r.matchedCount > 0;
}

/** 跑一個 stage，寫狀態；回傳下一個該跑的 stage（沒有就 null） */
export async function runStage(jobIdStr: string, stage: Stage): Promise<{ ok: boolean; next: Stage | null; error?: string; skipped?: boolean }> {
  if (!STAGES.includes(stage)) throw new Error(`未知 stage ${stage}`);
  const job = await jobs.byId(jobIdStr);
  if (!job?._id) throw new Error("job 不存在");
  const jobId = job._id;
  const loader = impls[stage];
  if (!loader) throw new Error(`stage ${stage} 尚未實作`);
  if (!(await claim(jobId, stage))) return { ok: true, next: null, skipped: true };
  const started = Date.now();
  const chain = chainOf(stage);
  if (chain === AUTO_STAGES && job.status !== "processing") await jobs.patch(jobId, { status: "processing" });
  if (chain === PRODUCE_STAGES && job.status !== "producing") await jobs.patch(jobId, { status: "producing" });
  try {
    const { default: fn } = await loader();
    const fresh = (await jobs.byId(jobId))!;
    const r = await fn({ job: fresh, jobId, log: (m) => console.log(`[${job.code}][${stage}] ${m}`) });
    if (r?.again) {
      await jobs.setStage(jobId, stage, { status: "pending", note: r.note });
      return { ok: true, next: stage };
    }
    await jobs.setStage(jobId, stage, { status: "done", finishedAt: new Date(), ms: Date.now() - started, note: r?.note });
    const next = nextStage(stage, chain);
    if (!next) await jobs.patch(jobId, { status: chain === AUTO_STAGES ? "review" : "done" });
    return { ok: true, next };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${job.code}][${stage}] 失敗`, msg);
    await jobs.setStage(jobId, stage, { status: "failed", finishedAt: new Date(), ms: Date.now() - started, error: msg.slice(0, 2000) });
    await jobs.patch(jobId, { status: "failed" });
    return { ok: false, next: null, error: msg };
  }
}

/** 推進一個 job：找出下一個該跑的 stage 並直接在這個函式裡跑完 */
export async function advance(jobIdStr: string): Promise<{ ran: Stage | null; next: Stage | null }> {
  const job = await jobs.byId(jobIdStr);
  if (!job?._id) return { ran: null, next: null };
  const { stage } = pendingStage(job);
  if (!stage) return { ran: null, next: null };
  const r = await runStage(jobIdStr, stage);
  return { ran: r.skipped ? null : stage, next: r.next };
}

/**
 * 啟動下一個 stage：對自己的 /run 發一個「只排隊、立刻回 202」的請求。
 * 用 node:http(s) 而不是全域 fetch，避免 Vercel 的追蹤標頭跟著傳下去、累積到第五層被 508 迴圈保護擋掉。
 * 就算這個請求失敗，Cron 與前端輪詢也會把工作接起來。
 */
export function triggerStage(jobId: string, stage: Stage): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const url = new URL(`${base}/api/jobs/${jobId}/run`);
  const body = JSON.stringify({ stage });
  return new Promise((resolve) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(url, { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), "x-worker-secret": process.env.WORKER_SECRET ?? "" }, timeout: 8000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300) console.error(`trigger ${stage} 回 ${res.statusCode}`);
      res.resume();
      resolve();
    });
    req.on("timeout", () => { req.destroy(); resolve(); });
    req.on("error", (e) => { console.error(`trigger ${stage} 失敗 ${e.message}`); resolve(); });
    req.end(body);
  });
}

/** 跑完一個 stage 後接著啟動下一個；供 run route 的 after() 使用 */
export async function runAndChain(jobId: string, stage: Stage) {
  const r = await runStage(jobId, stage);
  if (r.ok && r.next && !r.skipped) await triggerStage(jobId, r.next);
  return r;
}
