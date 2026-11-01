import path from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import type { SegmentationMaskRecord } from "@meta-sam/parser";
import { samParser, type SamParser } from "@/lib/sam-parser";
import type { StageFn } from "@/lib/pipeline";
import { samVideo, samImage, uploadFile } from "@/lib/meta";
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
const segment: StageFn = async (ctx) => (ctx.job.source === "photos" ? segmentPhotos(ctx) : segmentVideo(ctx));

/** 照片來源：每張照片對每個品類跑一次 SAM 圖片模式；每個物件一條 track，t 用照片索引 */
const segmentPhotos: StageFn = async ({ job, jobId, log }) => {
  if (!job.categories.length) throw new Error("沒有品類");
  if (!job.frames.length) throw new Error("沒有照片");
  const { recordsOfKind, decodeMaskToRaster } = await samParser();
  const dir = await tmpDir();
  try {
    const drafts: Draft[] = [];
    let usd = 0;
    const uploads: Promise<void>[] = [];
    const runId = Date.now().toString(36);
    for (const [pi, fr] of job.frames.entries()) {
      const file = path.join(dir, `p_${pi}.jpg`);
      await download(fr.url, file);
      const meta = await sharp(file).metadata();
      const W = meta.width!, H = meta.height!;
      for (const cat of job.categories) {
        const { result, usd: u } = await samImage({ imageUrl: fr.url, phrase: cat.phrase });
        usd += u;
        const boxes = recordsOfKind(result.records, "box");
        const masks = recordsOfKind(result.records, "mask");
        for (const b of boxes) {
          const box: Box = { t: pi, frame: pi, x1: b.left, y1: b.top, x2: b.right, y2: b.bottom, w: W, h: H, conf: b.confidence };
          const a = area(box);
          if (a < PIPE.minTrackArea || (b.confidence ?? 0.7) < PIPE.minTrackConf) continue;
          const tr: Draft = { jobId, category: cat.name, samCategory: cat.name, samObjectId: `p${pi}-${b.objectId}`, startSec: pi, endSec: pi + 1, boxes: [box], crops: [], cutouts: [], meanConf: b.confidence ?? 0.7, meanArea: a, bestT: pi };
          const ti = drafts.push(tr) - 1;
          const key = `jobs/${job.code}/tracks/${runId}/${ti}`;
          const m = Math.max(box.x2 - box.x1, box.y2 - box.y1) * PIPE.cropMargin;
          const left = Math.max(0, Math.floor(box.x1 - m)), top = Math.max(0, Math.floor(box.y1 - m));
          const width = Math.min(W - left, Math.ceil(box.x2 - box.x1 + 2 * m)), height = Math.min(H - top, Math.ceil(box.y2 - box.y1 + 2 * m));
          if (width < 8 || height < 8) continue;
          const cropBuf = await sharp(file).extract({ left, top, width, height }).jpeg({ quality: 90 }).toBuffer();
          uploads.push(putBlob(`${key}/crop_0.jpg`, cropBuf).then((url) => { tr.crops.push({ t: pi, url }); }));
          const mrec = masks.find((mm) => mm.objectId === b.objectId);
          if (mrec) {
            try {
              const cut = await cutout(file, mrec, 1, 1, W, H, decodeMaskToRaster);
              uploads.push(putBlob(`${key}/cutout_0.png`, cut).then((url) => { tr.cutouts.push({ t: pi, url }); }));
            } catch (e) { log(`cutout 失敗 photo ${pi}: ${(e as Error).message}`); }
          }
        }
        log(`photo ${pi} ${cat.phrase}: ${boxes.length} boxes`);
      }
    }
    await Promise.all(uploads);
    pruneTracks(drafts, log);
    const saved = await trackRepo.replaceForJob(jobId, drafts);
    await jobs.addCost(jobId, usd);
    await jobs.patch(jobId, { "metrics.trackCount": saved.length, "metrics.samFrames": job.frames.length * job.categories.length });
    return { note: `${saved.length} 件（${job.frames.length} 張照片）` };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

const segmentVideo: StageFn = async ({ job, jobId, log }) => {
  const v = job.video;
  if (!v.fps4Url || !v.procWidth || !v.procHeight) throw new Error("缺少處理版影片");
  if (!job.categories.length) throw new Error("沒有品類");
  const fps = v.procFps || PIPE.procFps;
  const totalFrames = Math.ceil((v.durationSec ?? 0) * fps);

  const { recordsOfKind, decodeMaskToRaster } = await samParser();
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
        // 同一個 SAM ID 若中間斷掉太久或框突然跳走，視為不同段（SAM 的 ID 會在物件出鏡後被別的物件接走）
        for (const [k, seg] of splitTrack(list, fps).entries()) {
          const meanConf = seg.reduce((s, b) => s + (b.conf ?? 0.7), 0) / seg.length;
          const meanArea = seg.reduce((s, b) => s + area(b), 0) / seg.length;
          const dur = seg[seg.length - 1].t - seg[0].t + 1 / fps;
          if (dur < PIPE.minTrackSec || meanArea < PIPE.minTrackArea || meanConf < PIPE.minTrackConf) continue;
          // 又小又短的片段通常是商品剛進出畫面時的一小角（把手、邊緣），不成一件
          if (meanArea < PIPE.sliverArea && dur < PIPE.sliverSec) continue;
          drafts.push({ jobId, category: cat.name, samCategory: cat.name, samObjectId: k ? `${objectId}-${k}` : objectId, startSec: seg[0].t, endSec: seg[seg.length - 1].t + 1 / fps, boxes: seg, crops: [], cutouts: [], meanConf, meanArea });
        }
      }
    }
    const before = drafts.length;
    pruneTracks(drafts, log);
    log(`${before} → ${drafts.length} tracks after split/prune`);

    // 裁圖與去背：每條 track 取 cropsPerTrack 個相隔 ≥0.5 秒的最佳影格
    const frameCache = new Map<number, string>();
    const frameFile = async (frame: number) => {
      const hit = frameCache.get(frame);
      if (hit) return hit;
      const f = path.join(dir, `f_${frame}.png`);
      const dur = v.durationSec ?? Infinity;
      // 最後幾格可能超出可解碼範圍，往前退一點重試
      for (const t of [frame / fps + 0.001, frame / fps - 0.2, dur - 0.5]) {
        if (t < 0 || t > dur) continue;
        await frameAt(low, t, f, Math.min(v.procWidth!, v.procHeight!)).catch(() => {});  // 與代理檔同解析度，不放大
        if (await fs.stat(f).then(() => true, () => false)) break;
      }
      await fs.stat(f).catch(() => { throw new Error(`抽不到影格 ${frame}`); });
      frameCache.set(frame, f);
      return f;
    };

    const uploads: Promise<void>[] = [];
    const tCrop = Date.now();
    const runId = tCrop.toString(36);  // 每次重跑用新路徑，不覆蓋舊網址（公開 Blob 會被 CDN 快取）
    for (let ti = 0; ti < drafts.length; ti++) {
      const tr = drafts[ti];
      const ranked = [...tr.boxes].sort((a, b) => score(b) - score(a));
      const picked: Box[] = [];
      for (const b of ranked) {
        if (picked.every((p) => Math.abs(p.t - b.t) >= 0.5)) picked.push(b);
        if (picked.length >= PIPE.cropsPerTrack) break;
      }
      tr.bestT = picked[0]?.t;
      const key = `jobs/${job.code}/tracks/${runId}/${ti}`;
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
        uploads.push(putBlob(`${key}/crop_${k}.jpg`, cropBuf).then((url) => { tr.crops.push({ t: b.t, url }); }));

        const mrec = maskIndex.get(`${tr.category}|${tr.samObjectId.split("-")[0]}|${b.frame}`);
        if (mrec) {
          try {
            const cut = await cutout(file, mrec, sx, sy, W, H, decodeMaskToRaster);
            uploads.push(putBlob(`${key}/cutout_${k}.png`, cut).then((url) => { tr.cutouts.push({ t: b.t, url }); }));
          } catch (e) {
            log(`cutout 失敗 track ${ti} frame ${b.frame}: ${(e as Error).message}`);
          }
        }
        if (uploads.length >= 8) { await Promise.all(uploads); uploads.length = 0; }
      }
    }
    await Promise.all(uploads);
    for (const tr of drafts) { tr.crops.sort((a, b) => a.t - b.t); tr.cutouts.sort((a, b) => a.t - b.t); }
    log(`crops done in ${Date.now() - tCrop}ms`);

    const saved = await trackRepo.replaceForJob(jobId, drafts);
    await jobs.addCost(jobId, usdTotal);
    await jobs.patch(jobId, { "metrics.trackCount": saved.length, "metrics.samFrames": samFrames });
    return { note: `${saved.length} tracks（${job.categories.map((c) => `${c.name} ${saved.filter((t) => t.category === c.name).length}`).join("、")}）` };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};
export default segment;

const area = (b: Box) => ((b.x2 - b.x1) * (b.y2 - b.y1)) / (b.w * b.h);

/** 在時間斷點（缺格 ≥ 1.5 秒）或空間跳躍（中心移動超過半個畫面且尺寸變化 2 倍以上）處切開 */
function splitTrack(list: Box[], fps: number): Box[][] {
  const segs: Box[][] = [];
  let cur: Box[] = [];
  for (const b of list) {
    const prev = cur[cur.length - 1];
    if (prev) {
      const gap = (b.frame - prev.frame) / fps;
      const dx = Math.abs((b.x1 + b.x2) / 2 - (prev.x1 + prev.x2) / 2) / b.w;
      const ratio = area(b) / Math.max(1e-6, area(prev));
      if (gap >= 1.5 || (dx > 0.5 && (ratio > 2 || ratio < 0.5))) { segs.push(cur); cur = []; }
    }
    cur.push(b);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

/** 兩條 track 在共同影格上的平均 IoU 與「A 被 B 包含的比例」 */
function overlapStats(a: Draft, b: Draft) {
  const bByFrame = new Map(b.boxes.map((x) => [x.frame, x]));
  let n = 0, iou = 0, contain = 0;
  for (const x of a.boxes) {
    const y = bByFrame.get(x.frame);
    if (!y) continue;
    const ix = Math.max(0, Math.min(x.x2, y.x2) - Math.max(x.x1, y.x1));
    const iy = Math.max(0, Math.min(x.y2, y.y2) - Math.max(x.y1, y.y1));
    const inter = ix * iy, ax = (x.x2 - x.x1) * (x.y2 - x.y1), ay = (y.x2 - y.x1) * (y.y2 - y.y1);
    iou += inter / Math.max(1, ax + ay - inter);
    contain += inter / Math.max(1, ax);
    n++;
  }
  return n ? { n, iou: iou / n, contain: contain / n, shareOfA: n / a.boxes.length } : null;
}

/**
 * 規則：
 * 1. 同品類：A 大部分時間被 B 包含（把手、瓶蓋這種零件）→ 丟 A
 * 2. 跨品類：兩條 track 在共同影格高度重疊（同一個東西被兩個名詞片語都抓到）→ 留信心×時長較高的
 */
function pruneTracks(drafts: Draft[], log: (m: string) => void) {
  const drop = new Set<number>();
  const score = (t: Draft) => (t.meanConf ?? 0.5) * (t.endSec - t.startSec);
  for (let i = 0; i < drafts.length; i++) for (let j = 0; j < drafts.length; j++) {
    if (i === j || drop.has(i) || drop.has(j)) continue;
    const a = drafts[i], b = drafts[j];
    if (a.startSec >= b.endSec || b.startSec >= a.endSec) continue;
    const st = overlapStats(a, b);
    if (!st || st.shareOfA < 0.5) continue;
    if (a.category === b.category) {
      if (st.contain > 0.8 && (a.meanArea ?? 0) < (b.meanArea ?? 0)) { drop.add(i); log(`drop ${a.category} ${a.samObjectId}: contained in ${b.samObjectId}`); }
    } else if (st.iou > 0.5) {
      const loser = score(a) < score(b) ? i : j;
      drop.add(loser);
      log(`drop ${drafts[loser].category} ${drafts[loser].samObjectId}: same object as ${drafts[loser === i ? j : i].category}`);
    }
  }
  for (const i of [...drop].sort((x, y) => y - x)) drafts.splice(i, 1);
}

/** 用 SAM 遮罩把商品從影格切出、放在白底上（Muse Image 不支援遮罩編輯，所以白底圖先用這個保底） */
async function cutout(frameFile: string, m: SegmentationMaskRecord, sx: number, sy: number, W: number, H: number, decodeMaskToRaster: SamParser["decodeMaskToRaster"]): Promise<Buffer> {
  const raster = decodeMaskToRaster(m.mask);
  const rw = m.mask.width, rh = m.mask.height;
  const left = Math.max(0, Math.round(m.bounds.left * sx)), top = Math.max(0, Math.round(m.bounds.top * sy));
  const width = Math.min(W - left, Math.max(1, Math.round((m.bounds.right - m.bounds.left) * sx)));
  const height = Math.min(H - top, Math.max(1, Math.round((m.bounds.bottom - m.bounds.top) * sy)));
  const alphaRaw = Buffer.alloc(rw * rh);
  for (let i = 0; i < raster.length; i++) alphaRaw[i] = raster[i] ? 255 : 0;
  // 注意：resize／blur 可能把單通道升成三通道，合併前一定要只取一個通道，否則 stride 錯位會出現橫紋
  const alpha = await sharp(alphaRaw, { raw: { width: rw, height: rh, channels: 1 } })
    .resize(width, height, { kernel: "nearest", fit: "fill" })
    .blur(0.6)
    .extractChannel(0)
    .raw().toBuffer();
  const rgb = await sharp(frameFile).extract({ left, top, width, height }).removeAlpha().raw().toBuffer();
  const rgba = await sharp(rgb, { raw: { width, height, channels: 3 } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
  // 透明背景的正方形 PNG：商品卡顯示在白底上，短片則可以直接放在任何背景
  const pad = Math.round(Math.max(width, height) * PIPE.cutoutPad);
  const side = Math.max(width, height) + pad * 2;
  return sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: rgba, left: Math.round((side - width) / 2), top: Math.round((side - height) / 2) }])
    .png().toBuffer();
}
