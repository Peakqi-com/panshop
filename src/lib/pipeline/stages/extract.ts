import path from "node:path";
import { promises as fs } from "node:fs";
import type { StageFn } from "@/lib/pipeline";
import { download, extractWav, frameAt, probe, tmpDir, transcodeLowFps } from "@/lib/ffmpeg";
import { putFile, putBlob } from "@/lib/blob";
import sharp from "sharp";
import { jobs } from "@/repositories/jobs";
import { PIPE } from "@/lib/config";
import { settings } from "@/repositories/settings";

/** stage 1：原始影片 → 4 fps 720p（給 SAM）、總覽影格（給 Spark 與 UI）、24 kHz WAV（給 Voice） */
const extract: StageFn = async ({ job, jobId, log }) => {
  const dir = await tmpDir();
  try {
    if (job.source === "photos") {
      // 照片來源：每張照片正規化成最長邊 1600 的 JPEG，直接當影格；沒有音軌
      if (!job.photos.length) throw new Error("沒有照片");
      const frames: { t: number; url: string }[] = [];
      for (const [i, ph] of job.photos.entries()) {
        const f = path.join(dir, `p_${i}`);
        await download(ph.url, f);
        const out = await sharp(f).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
        frames.push({ t: i, url: await putBlob(`jobs/${job.code}/photos/${i}.jpg`, out) });
      }
      await jobs.patch(jobId, { frames, "video.durationSec": job.photos.length, "video.procFps": 1 });
      return { note: `${frames.length} 張照片` };
    }
    if (!job.video.originalUrl) throw new Error("沒有影片");
    const src = path.join(dir, "src" + (path.extname(job.video.fileName ?? "") || ".mp4"));
    await download(job.video.originalUrl, src);
    const p = await probe(src);
    if (!p.durationSec) throw new Error("讀不到影片長度，格式可能不支援");
    const cfg = await settings.get();
    const maxSec = job.source === "replay" ? cfg.maxReplaySec : cfg.maxVideoSec;
    if (p.durationSec > maxSec) throw new Error(`影片 ${Math.round(p.durationSec)} 秒，上限 ${maxSec} 秒`);
    log(`probe ${p.width}x${p.height} ${p.durationSec}s ${p.fps}fps rot${p.rotation}`);

    const low = path.join(dir, "proc.mp4");
    await transcodeLowFps(src, low, PIPE.procFps, PIPE.procShort);
    const lp = await probe(low);
    const fps4Url = await putFile(`jobs/${job.code}/proc.mp4`, low);

    const n = job.source === "replay" ? Math.min(16, PIPE.overviewFrames * 2) : PIPE.overviewFrames;
    const frames: { t: number; url: string }[] = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(p.durationSec - 0.2, (p.durationSec * (i + 0.5)) / n);
      const f = path.join(dir, `ov_${i}.jpg`);
      await frameAt(src, Math.max(0, t), f, 1080);
      frames.push({ t: Number(t.toFixed(2)), url: await putFile(`jobs/${job.code}/overview/${i}.jpg`, f) });
    }

    const wav = await extractWav(src, path.join(dir, "audio.wav"));
    const audioUrl = wav ? await putFile(`jobs/${job.code}/audio.wav`, wav) : undefined;

    await jobs.patch(jobId, {
      "video.durationSec": p.durationSec, "video.width": p.width, "video.height": p.height, "video.sourceFps": p.fps,
      "video.fps4Url": fps4Url, "video.procWidth": lp.width, "video.procHeight": lp.height, "video.procFps": PIPE.procFps,
      "video.audioUrl": audioUrl, frames,
    });
    return { note: `${p.durationSec.toFixed(1)}s, proc ${lp.width}x${lp.height}, audio ${audioUrl ? "yes" : "no"}` };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};
export default extract;
