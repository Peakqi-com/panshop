import { customAlphabet } from "nanoid";
import { after } from "next/server";
import { z } from "zod";
import { jobs } from "@/repositories/jobs";
import { triggerStage } from "@/lib/pipeline";
import { checkUploadPasscode } from "@/lib/auth";
import { STYLES, DEFAULT_STYLE } from "@/lib/config";
import { settings } from "@/repositories/settings";

const code = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 10);

const Body = z.object({
  sample: z.boolean().optional(),
  videoUrl: z.string().url().optional(),
  fileName: z.string().optional(),
  bytes: z.number().optional(),
  shopName: z.string().max(60).default(""),
  currency: z.string().max(5).default("TWD"),
  style: z.string().optional(),
  passcode: z.string().optional(),
});

/** 建 job 並啟動管線 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "參數不對" }, { status: 400 });
  const b = parsed.data;
  if (!checkUploadPasscode(b.passcode)) return Response.json({ error: "通行碼不對" }, { status: 403 });
  const cfg = await settings.get();
  const videoUrl = b.sample ? (cfg.sampleVideoUrl || process.env.SAMPLE_VIDEO_URL) : b.videoUrl;
  if (!videoUrl) return Response.json({ error: b.sample ? "沒有設定範例影片" : "缺少影片" }, { status: 400 });
  const job = await jobs.create({
    code: code(),
    status: "uploaded",
    shopName: b.shopName || (b.sample ? "範例：桌上八件" : ""),
    currency: b.currency,
    language: "zh-TW",
    style: b.style && b.style in STYLES ? b.style : (cfg.defaultStyle in STYLES ? cfg.defaultStyle : DEFAULT_STYLE),
    video: { originalUrl: videoUrl, fileName: b.sample ? "sample.mp4" : b.fileName, bytes: b.bytes, procFps: 4 },
    frames: [], categories: [], transcript: [], stages: {} as never, metrics: {},
  });
  const id = String(job._id);
  after(() => triggerStage(id, "extract"));
  return Response.json({ id, code: job.code });
}

export async function GET() {
  const list = await jobs.list(30);
  return Response.json(list.map((j) => ({ id: String(j._id), code: j.code, status: j.status, createdAt: j.createdAt, itemCount: j.metrics.itemCount ?? null })));
}
