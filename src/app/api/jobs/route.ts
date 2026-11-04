import { customAlphabet } from "nanoid";
import { after } from "next/server";
import { z } from "zod";
import { jobs } from "@/repositories/jobs";
import { triggerStage } from "@/lib/pipeline";
import { checkUploadPasscode, isAdmin } from "@/lib/auth";
import { issueEditToken } from "@/lib/owner";
import { STYLES, DEFAULT_STYLE } from "@/lib/config";
import { settings } from "@/repositories/settings";
import { checkTrial, clientIpHash } from "@/lib/trial";
import { jobLanguage, makeT, defaultCurrency, type Lang } from "@/lib/i18n";

const code = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 10);

const Body = z.object({
  source: z.enum(["video", "photos", "replay"]).default("video"),
  sample: z.boolean().optional(),
  videoUrl: z.string().url().optional(),           // 影片或回放：Blob 網址，或可直接下載的 mp4 網址
  photos: z.array(z.object({ url: z.string().url(), name: z.string().optional() })).max(60).optional(),
  fileName: z.string().optional(),
  bytes: z.number().optional(),
  shopName: z.string().max(60).default(""),
  currency: z.enum(["TWD", "USD"]).optional(),
  style: z.string().optional(),
  passcode: z.string().optional(),
  lang: z.enum(["zh", "en"]).optional(),
});

/** 建 job 並啟動管線。三種來源共用同一條管線，差別在 extract 與 segment */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "參數不對 / Invalid request" }, { status: 400 });
  const b = parsed.data;
  const lang: Lang = b.lang ?? "zh";
  const t = makeT(lang);
  if (!checkUploadPasscode(b.passcode)) return Response.json({ error: t("通行碼不對", "Wrong passcode") }, { status: 403 });
  const limited = await checkTrial(lang, { newJob: true });
  if (limited) return Response.json({ error: limited.error }, { status: limited.status });
  const cfg = await settings.get();
  let videoUrl = b.sample ? (cfg.sampleVideoUrl || process.env.SAMPLE_VIDEO_URL) : b.videoUrl;
  const source = b.sample ? "video" : b.source;
  if (source === "photos") {
    if (!b.photos?.length) return Response.json({ error: t("沒有照片", "No photos") }, { status: 400 });
    if (b.photos.length > cfg.maxPhotos) return Response.json({ error: t(`一次最多 ${cfg.maxPhotos} 張`, `Up to ${cfg.maxPhotos} photos at a time`) }, { status: 400 });
    videoUrl = undefined;
  } else if (!videoUrl) {
    return Response.json({ error: b.sample ? t("沒有設定範例影片", "No sample video is configured") : t("缺少影片", "Missing video") }, { status: 400 });
  } else if (source === "replay" && !/^https:\/\//.test(videoUrl)) {
    return Response.json({ error: t("回放網址要是 https 開頭、可直接下載的影片檔", "The replay link must be an https URL to a downloadable video file") }, { status: 400 });
  }
  const jobCode = code();
  const editTokenHash = await issueEditToken(jobCode);
  const job = await jobs.create({
    code: jobCode,
    editTokenHash,
    ipHash: await clientIpHash(),
    status: "uploaded",
    shopName: b.shopName || (b.sample ? t("範例：桌上八件", "Sample: eight things on a desk") : ""),
    currency: b.currency ?? defaultCurrency(lang),
    language: jobLanguage(lang),
    style: b.style && b.style in STYLES ? b.style : (cfg.defaultStyle in STYLES ? cfg.defaultStyle : DEFAULT_STYLE),
    source,
    photos: source === "photos" ? b.photos! : [],
    video: { originalUrl: videoUrl, fileName: b.sample ? "sample.mp4" : b.fileName, bytes: b.bytes, procFps: 4 },
    frames: [], categories: [], transcript: [], stages: {} as never, metrics: {},
  });
  const id = String(job._id);
  after(() => triggerStage(id, "extract"));
  return Response.json({ id, code: job.code });
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "需要管理員登入" }, { status: 403 });
  const list = await jobs.list(30);
  return Response.json(list.map((j) => ({ id: String(j._id), code: j.code, status: j.status, source: j.source, createdAt: j.createdAt, itemCount: j.metrics.itemCount ?? null })));
}
