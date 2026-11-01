import path from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import { decodeMaskToRaster, recordsOfKind, type SegmentationMaskRecord } from "@meta-sam/parser";
import type { StageFn } from "@/lib/pipeline";
import { samVideo, uploadFile } from "@/lib/meta";
import { download, frameAt, tmpDir } from "@/lib/ffmpeg";
import { putBlob } from "@/lib/blob";
import { jobs } from "@/repositories/jobs";
import { tracks as trackRepo } from "@/repositories/tracks";
import type { Box, Track } from "@/models/track";
import { PIPE } from "@/lib/config";

type Draft = Omit<Track, "_id" | "createdAt">;

/** 一個框的「好看程度」：面積大、信心高、靠中央、不貼邊 */
function score(b: Box) {
  const area = ((b.x2 - b.x1) * (b.y2 - b.y1)) / (b.w * b.h);
  const cx = (b.x1 + b.x2) / 2 / b.w, cy = (b.y1 + b.y2) / 2 / b.h;
  const center = 1 - Math.min(1, Math.hypot(cx - 0.5, cy - 0.5) * 1.6);
  const edge = b.x1 <= 2 || b.y1 <= 2 || b.x2 >= b.w - 2 || b.y2 >= b.h - 2 ? 0.5 : 1;
  return Math.sqrt(area) * (b.conf ?? 0.7) * (0.5 + 0.5 * center) * edge;
}

/** stage 3：每個品類一次 SAM 影片請求 → track；每條 track 挑最佳影格做裁圖與去背 */
const segment: StageFn = async ({ job, jobId, log }) => {
  const v = job.video;
  if (!v.fps4Url || !v.procWidth || !v.procHeight) throw new Error("缺少處理版影片");
  if (!job.categories.length) throw new Error("沒有品類");
  const fps = v.procFps || PIPE.procFps;
  const totalFrames = Math.ceil((v.durationSec ?? 0) * fps);

  const dir = await tmpDir();
  try {
    const low = path.join(dir, "proc.mp4");
    await download(v.fps4Url, low);
    const fileId = await uploadFile(await fs.readFile(low), "proc.mp4", "video/mp4");
    log(`files api ${fileId}, ${totalFrames} frames × ${job.categories.length} categories`);

    const drafts: Draft[] = [];
    const maskIndex = new Map<string, SegmentationMaskRecord>(); // `${category}|${objectId}|${frame}`
    let usdTotal = 0;
    let samFrames = 0;

    for (const cat of job.categories) {
      const t0 = Date.now();
      const { result, usd } = await samVideo({ fileId, phrase: cat.phrase, frames: totalFrames });
      usdTotal += usd; samFrames += totalFrames;
      const boxes = recordsOfKind(result.records, "box");
      const masks = recordsOfKind(result.records, "mask");
      log(`${cat.phrase}: ${boxes.length} boxes, ${masks.length} masks, ${result.outcome.status}, ${Date.now() - t0}ms, diag ${result.diagnostics.length}`);
      for (const m of masks) if (m.frame) maskIndex.set(`${cat.name}|${m.objectId}|${m.frame.frameIndex}`, m);

      const byObj = new Map<string, Box[]>();
      for (const b of boxes) {
        if (!b.frame) continue;
        const box: Box = { t: b.frame.frameIndex / fps, frame: b.frame.frameIndex, x1: b.left, y1: b.top, x2: b.right, y2: b.bottom, w: v.procWidth, h: v.procHeight, conf: b.confidence };
        const arr = byObj.get(b.objectId) ?? [];
        arr.push(box);
        byObj.set(b.objectId, arr);
      }
      for (const [objectId, list] of byObj) {
        list.sort((a, b) => a.frame - b.frame);
        const meanConf = list.reduce((s, b) => s + (b.conf ?? 0.7), 0) / list.length;
        const meanArea = list.reduce((s, b) => s + ((b.x2 - b.x1) * (b.y2 - b.y1)) / (b.w * b.h), 0) / list.length;
        const dur = list[list.length - 1].t - list[0].t + 1 / fps;
        if (dur < PIPE.minTrackSec || meanArea < PIPE.minTrackArea || meanConf < PIPE.minTrackConf) continue;
        drafts.push({ jobId, category: cat.name, samObjectId: objectId, startSec: list[0].t, endSec: list[list.length - 1].t + 1 / fps, boxes: list, crops: [], cutouts: [], meanConf, meanArea });
      }
    }
    log(`${drafts.length} tracks after filtering`);

    // 裁圖與去背：每條 track 取 cropsPerTrack 個相隔 ≥0.5 秒的最佳影格
    const frameCache = new Map<number, string>();
    const frameFile = async (frame: number) => {
      const hit = frameCache.get(frame);
      if (hit) return hit;
      const f = path.join(dir, `f_${frame}.png`);
      await frameAt(low, frame / fps + 0.001, f, Math.max(v.procWidth!, v.procHeight!));
      frameCache.set(frame, f);
      return f;
    };

    for (let ti = 0; ti < drafts.length; ti++) {
      const tr = drafts[ti];
      const ranked = [...tr.boxes].sort((a, b) => score(b) - score(a));
      const picked: Box[] = [];
      for (const b of ranked) {
        if (picked.every((p) => Math.abs(p.t - b.t) >= 0.5)) picked.push(b);
        if (picked.length >= PIPE.cropsPerTrack) break;
      }
      tr.bestT = picked[0]?.t;
      const key = `jobs/${job.code}/tracks/${ti}`;
      for (let k = 0; k < picked.length; k++) {
        const b = picked[k];
        const file = await frameFile(b.frame);
        const img = sharp(file);
        const meta = await img.metadata();
        const W = meta.width ?? v.procWidth, H = meta.height ?? v.procHeight;
        const sx = W / v.procWidth, sy = H / v.procHeight; // 影格與 SAM 座標理論上相同，保險起見換算
        const bw = (b.x2 - b.x1) * sx, bh = (b.y2 - b.y1) * sy;
        const m = Math.max(bw, bh) * PIPE.cropMargin;
        const left = Math.max(0, Math.floor(b.x1 * sx - m)), top = Math.max(0, Math.floor(b.y1 * sy - m));
        const width = Math.min(W - left, Math.ceil(bw + 2 * m)), height = Math.min(H - top, Math.ceil(bh + 2 * m));
        if (width < 8 || height < 8) continue;
        const cropBuf = await sharp(file).extract({ left, top, width, height }).jpeg({ quality: 90 }).toBuffer();
        tr.crops.push({ t: b.t, url: await putBlob(`${key}/crop_${k}.jpg`, cropBuf) });

        const mrec = maskIndex.get(`${tr.category}|${tr.samObjectId}|${b.frame}`);
        if (mrec) {
          try {
            const cut = await cutout(file, mrec, sx, sy, W, H);
            tr.cutouts.push({ t: b.t, url: await putBlob(`${key}/cutout_${k}.png`, cut) });
          } catch (e) {
            log(`cutout 失敗 track ${ti} frame ${b.frame}: ${(e as Error).message}`);
          }
        }
      }
    }

    const saved = await trackRepo.replaceForJob(jobId, drafts);
    await jobs.addCost(jobId, usdTotal);
    await jobs.patch(jobId, { "metrics.trackCount": saved.length, "metrics.samFrames": samFrames });
    return { note: `${saved.length} tracks（${job.categories.map((c) => `${c.name} ${saved.filter((t) => t.category === c.name).length}`).join("、")}）` };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};
export default segment;

/** 用 SAM 遮罩把商品從影格切出、放在白底上（Muse Image 不支援遮罩編輯，所以白底圖先用這個保底） */
async function cutout(frameFile: string, m: SegmentationMaskRecord, sx: number, sy: number, W: number, H: number): Promise<Buffer> {
  const raster = decodeMaskToRaster(m.mask);
  const rw = m.mask.width, rh = m.mask.height;
  const left = Math.max(0, Math.round(m.bounds.left * sx)), top = Math.max(0, Math.round(m.bounds.top * sy));
  const width = Math.min(W - left, Math.max(1, Math.round((m.bounds.right - m.bounds.left) * sx)));
  const height = Math.min(H - top, Math.max(1, Math.round((m.bounds.bottom - m.bounds.top) * sy)));
  const alphaRaw = Buffer.alloc(rw * rh);
  for (let i = 0; i < raster.length; i++) alphaRaw[i] = raster[i] ? 255 : 0;
  const alpha = await sharp(alphaRaw, { raw: { width: rw, height: rh, channels: 1 } })
    .resize(width, height, { kernel: "nearest", fit: "fill" })
    .blur(0.6)
    .raw().toBuffer();
  const rgb = await sharp(frameFile).extract({ left, top, width, height }).removeAlpha().raw().toBuffer();
  const rgba = await sharp(rgb, { raw: { width, height, channels: 3 } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
  const pad = Math.round(Math.max(width, height) * PIPE.cutoutPad);
  const side = Math.max(width, height) + pad * 2;
  return sharp({ create: { width: side, height: side, channels: 3, background: "#ffffff" } })
    .composite([{ input: rgba, left: Math.round((side - width) / 2), top: Math.round((side - height) / 2) }])
    .png().toBuffer();
}
