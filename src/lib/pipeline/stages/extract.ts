import path from "node:path";
import { promises as fs } from "node:fs";
import type { StageFn } from "@/lib/pipeline";
import { download, extractWav, frameAt, probe, tmpDir, transcodeLowFps } from "@/lib/ffmpeg";
import { putFile } from "@/lib/blob";
import { jobs } from "@/repositories/jobs";
import { PIPE } from "@/lib/config";

/** stage 1：原始影片 → 4 fps 720p（給 SAM）、總覽影格（給 Spark 與 UI）、24 kHz WAV（給 Voice） */
const extract: StageFn = async ({ job, jobId, log }) => {
  const dir = await tmpDir();
  try {
    const src = path.join(dir, "src" + (path.extname(job.video.fileName ?? "") || ".mp4"));
    await download(job.video.originalUrl, src);
    const p = await probe(src);
    if (!p.durationSec) throw new Error("讀不到影片長度，格式可能不支援");
    if (p.durationSec > 240) throw new Error(`影片 ${Math.round(p.durationSec)} 秒，上限 240 秒`);
    log(`probe ${p.width}x${p.height} ${p.durationSec}s ${p.fps}fps rot${p.rotation}`);

    const low = path.join(dir, "proc.mp4");
    await transcodeLowFps(src, low, PIPE.procFps, PIPE.procShort);
    const lp = await probe(low);
    const fps4Url = await putFile(`jobs/${job.code}/proc.mp4`, low);

    const n = PIPE.overviewFrames;
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
