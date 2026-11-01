import { after } from "next/server";
import { getDb } from "@/lib/db";
import type { Job } from "@/models/job";
import { pendingStage, triggerStage } from "@/lib/pipeline";

export const maxDuration = 60;

/**
 * 每分鐘掃一次進行中的工作，有 stage 待跑而沒人在跑的就啟動。
 * 這是對付 Vercel 508 迴圈保護與函式中途死掉的保險。Vercel Cron 會帶 Authorization: Bearer CRON_SECRET。
 */
export async function GET(req: Request) {
  const want = process.env.CRON_SECRET;
  if (!want || req.headers.get("authorization") !== `Bearer ${want}`) return new Response("unauthorized", { status: 401 });
  const db = await getDb();
  const since = new Date(Date.now() - 3 * 3600_000);
  const active = await db.collection<Job>("jobs").find({ status: { $in: ["uploaded", "processing", "producing"] }, updatedAt: { $gte: since } }).limit(50).toArray();
  const kicked: string[] = [];
  for (const job of active) {
    const p = pendingStage(job);
    if (p.stage) {
      const stage = p.stage, id = String(job._id);
      after(() => triggerStage(id, stage));
      kicked.push(`${job.code}:${stage}${p.stale ? "(stale)" : ""}`);
    }
  }
  return Response.json({ scanned: active.length, kicked });
}
