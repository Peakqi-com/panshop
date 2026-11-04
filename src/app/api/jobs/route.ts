import { customAlphabet } from "nanoid";
import { after } from "next/server";
import { z } from "zod";
import { jobs } from "@/repositories/jobs";
import { triggerStage } from "@/lib/pipeline";
import { checkUploadPasscode, isAdmin } from "@/lib/auth";
import { issueEditToken } from "@/lib/owner";
import { STYLES, DEFAULT_STYLE } from "@/lib/config";
import { settings } from "@/repositories/settings";

const code = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 10);

const Body = z.object({
  source: z.enum(["video", "photos", "replay"]).default("video"),
  sample: z.boolean().optional(),
  videoUrl: z.string().url().optional(),           // 影片或回放：Blob 網址，或可直接下載的 mp4 網址
  photos: z.array(z.object({ url: z.string().url(), name: z.string().optional() })).max(60).optional(),
  fileName: z.string().optional(),
  bytes: z.number().optional(),
  shopName: z.string().max(60).default(""),
  currency: z.string().max(5).default("TWD"),
  style: z.string().optional(),
  passcode: z.string().optional(),
});

/** 建 job 並啟動管線。三種來源共用同一條管線，差別在 extract 與 segment */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "參數不對" }, { status: 400 });
  const b = parsed.data;
  if (!checkUploadPasscode(b.passcode)) return Response.json({ error: "通行碼不對" }, { status: 403 });
  const cfg = await settings.get();
  let videoUrl = b.sample ? (cfg.sampleVideoUrl || process.env.SAMPLE_VIDEO_URL) : b.videoUrl;
  const source = b.sample ? "video" : b.source;
  if (source === "photos") {
    if (!b.photos?.length) return Response.json({ error: "沒有照片" }, { status: 400 });
    if (b.photos.length > cfg.maxPhotos) return Response.json({ error: `一次最多 ${cfg.maxPhotos} 張` }, { status: 400 });
    videoUrl = undefined;
  } else if (!videoUrl) {
    return Response.json({ error: b.sample ? "沒有設定範例影片" : "缺少影片" }, { status: 400 });
  } else if (source === "replay" && !/^https:\/\//.test(videoUrl)) {
    return Response.json({ error: "回放網址要是 https 開頭、可直接下載的影片檔" }, { status: 400 });
  }
  const jobCode = code();
  const editTokenHash = await issueEditToken(jobCode);
  const job = await jobs.create({
    code: jobCode,
    editTokenHash,
    status: "uploaded",
    shopName: b.shopName || (b.sample ? "範例：桌上八件" : ""),
    currency: b.currency,
    language: "zh-TW",
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
