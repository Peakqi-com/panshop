"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdminPasscode, grantAdmin, isAdmin } from "@/lib/auth";
import { setSetting, SETTING_KEYS, type SettingKey, getSetting } from "@/lib/settings";
import { settings } from "@/repositories/settings";
import { jobs } from "@/repositories/jobs";
import { triggerStage } from "@/lib/pipeline";
import { STAGES, AUTO_STAGES, PRODUCE_STAGES, type Stage } from "@/lib/stages";
import { delPrefix, delBlob } from "@/lib/blob";
import { getDb } from "@/lib/db";
import { sparkText } from "@/lib/meta";
import { sparkOpenChat } from "@/lib/baseten";
import { music } from "@/repositories/music";

async function guard() {
  if (!(await isAdmin())) throw new Error("未登入");
}

export async function loginAction(_: unknown, formData: FormData) {
  const code = String(formData.get("passcode") ?? "");
  if (!checkAdminPasscode(code)) return { ok: false, error: "通行碼不對" };
  await grantAdmin();
  revalidatePath("/admin");
  return { ok: true };
}

export async function saveSettingAction(_: unknown, formData: FormData) {
  await guard();
  const key = String(formData.get("key") ?? "") as SettingKey;
  const value = String(formData.get("value") ?? "").trim();
  if (!(key in SETTING_KEYS)) return { ok: false, error: "未知的設定" };
  if (value.length < 4) return { ok: false, error: "值太短" };
  await setSetting(key, value, "admin");
  revalidatePath("/admin/settings");
  return { ok: true, key };
}

export async function saveAppSettingsAction(_: unknown, formData: FormData) {
  await guard();
  try {
    await settings.save({
      maxVideoSec: Number(formData.get("maxVideoSec")),
      maxUploadMb: Number(formData.get("maxUploadMb")),
      maxReplaySec: Number(formData.get("maxReplaySec")),
      maxPhotos: Number(formData.get("maxPhotos")),
      defaultStyle: String(formData.get("defaultStyle") ?? "lifestyle"),
      sampleVideoUrl: String(formData.get("sampleVideoUrl") ?? "").trim(),
      siteName: String(formData.get("siteName") ?? "PanShop").trim() || "PanShop",
      announcement: String(formData.get("announcement") ?? "").trim(),
      commentModel: (String(formData.get("commentModel")) === "spark" ? "spark" : "spark-open"),
      voiceMode: (["tts", "seller", "none"].includes(String(formData.get("voiceMode"))) ? String(formData.get("voiceMode")) : "tts") as "tts" | "seller" | "none",
    });
    revalidatePath("/admin/settings");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function retryStageAction(jobId: string, stage: Stage) {
  await guard();
  if (!STAGES.includes(stage)) throw new Error("stage 不對");
  const chain = (PRODUCE_STAGES as string[]).includes(stage) ? PRODUCE_STAGES : AUTO_STAGES;
  const reset: Record<string, unknown> = { status: chain === AUTO_STAGES ? "processing" : "producing" };
  for (const st of chain.slice(chain.indexOf(stage))) reset[`stages.${st}`] = { status: "pending" };
  await jobs.patch(jobId, reset);
  await triggerStage(jobId, stage);
  revalidatePath(`/admin/jobs/${jobId}`);
}

/** 刪一個工作：資料庫紀錄、處理產生的 Blob、以及上傳的原始影片（範例影片除外） */
async function deleteOne(id: string) {
  const job = await jobs.byId(id);
  if (!job) return;
  await delPrefix(`jobs/${job.code}/`).catch(() => 0);
  const cfg = await settings.get();
  const sample = cfg.sampleVideoUrl || process.env.SAMPLE_VIDEO_URL;
  const src = job.video.originalUrl;
  if (src && src !== sample && /\.public\.blob\.vercel-storage\.com\//.test(src)) await delBlob(src).catch(() => undefined);
  await jobs.remove(id);
}

export async function deleteJobAction(formData: FormData) {
  await guard();
  await deleteOne(String(formData.get("id")));
  revalidatePath("/admin/jobs");
  redirect("/admin/jobs");
}

export async function deleteJobsAction(ids: string[]) {
  await guard();
  for (const id of ids) await deleteOne(id);
  revalidatePath("/admin/jobs");
  revalidatePath("/admin");
  return ids.length;
}

export async function addMusicAction(input: { title: string; url: string; durationSec: number; styles: string[]; license: string }) {
  await guard();
  if (!/\.public\.blob\.vercel-storage\.com\//.test(input.url)) throw new Error("音檔網址不對");
  await music.add(input);
  revalidatePath("/admin/music");
}

export async function updateMusicAction(id: string, set: { title?: string; styles?: string[]; license?: string; active?: boolean }) {
  await guard();
  await music.update(id, set);
  revalidatePath("/admin/music");
}

export async function deleteMusicAction(id: string) {
  await guard();
  const t = await music.byId(id);
  if (!t) return;
  await delBlob(t.url).catch(() => undefined);
  await music.remove(id);
  revalidatePath("/admin/music");
}

export type HealthRow = { name: string; ok: boolean; ms: number; detail: string };

/** 健康檢查：資料庫、Blob、Meta Model API（最便宜的一次 Spark 呼叫）、Baseten */
export async function runHealthAction(): Promise<HealthRow[]> {
  await guard();
  const rows: HealthRow[] = [];
  const timed = async (name: string, fn: () => Promise<string>) => {
    const t0 = Date.now();
    try { rows.push({ name, ok: true, ms: Date.now() - t0, detail: await fn() }); rows[rows.length - 1].ms = Date.now() - t0; }
    catch (e) { rows.push({ name, ok: false, ms: Date.now() - t0, detail: e instanceof Error ? e.message.slice(0, 200) : String(e) }); }
  };
  await timed("MongoDB Atlas", async () => { const db = await getDb(); const n = await db.collection("jobs").estimatedDocumentCount(); return `${n} 個 job`; });
  await timed("Vercel Blob", async () => { const { list } = await import("@vercel/blob"); const r = await list({ limit: 1 }); return r.blobs.length ? `可讀取（${r.blobs[0].pathname}）` : "可讀取（空）"; });
  await timed("Meta Model API（Muse Spark）", async () => { const key = await getSetting("META_API_KEY"); if (!key) throw new Error("未設定金鑰"); const r = await sparkText({ parts: [{ text: "回覆 OK" }], effort: "minimal", maxTokens: 20 }); return `回覆「${r.text.trim().slice(0, 20)}」，$${r.usd.toFixed(5)}`; });
  await timed("Baseten（Muse Spark Open）", async () => { const key = await getSetting("BASETEN_API_KEY"); if (!key) throw new Error("未設定金鑰"); const r = await sparkOpenChat({ user: "回覆 OK", maxTokens: 200 }); return `${r.model}，回覆「${r.text.trim().slice(0, 20)}」`; });
  await timed("ffmpeg", async () => { const { ffmpegPath, run } = await import("@/lib/ffmpeg"); const r = await run(["-version"]); return `${ffmpegPath().includes("ffmpeg-static") ? "ffmpeg-static" : "系統 ffmpeg"} ${r.stdout.split("\n")[0].slice(0, 40)}`; });
  return rows;
}
