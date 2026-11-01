import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/** ffmpeg 路徑：本機用 FFMPEG_PATH（brew），Vercel 用 ffmpeg-static 內附的二進位 */
export function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("ffmpeg-static") as string | null;
  if (!p) throw new Error("找不到 ffmpeg：請設 FFMPEG_PATH 或安裝 ffmpeg-static");
  return p;
}

export function run(args: string[], opts: { timeoutMs?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath(), args, { maxBuffer: 64 * 1024 * 1024, timeout: opts.timeoutMs ?? 240_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`ffmpeg 失敗：${err.message}\n${String(stderr).slice(-2000)}`));
      else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

export async function tmpDir(prefix = "panshop-"): Promise<string> {
  return fs.mkdtemp(path.join(/*turbopackIgnore: true*/ os.tmpdir(), prefix));
}

export async function download(url: string, dest: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`下載失敗 ${r.status} ${url}`);
  await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()));
  return dest;
}

export type Probe = { durationSec: number; width: number; height: number; fps: number; rotation: number };

/** 沒有 ffprobe（ffmpeg-static 不含），從 ffmpeg -i 的 stderr 解析 */
export async function probe(file: string): Promise<Probe> {
  let stderr = "";
  try {
    const r = await run(["-hide_banner", "-i", file]);
    stderr = r.stderr;
  } catch (e) {
    stderr = (e as Error).message; // ffmpeg -i 沒有輸出會以錯誤結束，資訊仍在 stderr
  }
  const dur = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const durationSec = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0;
  const vid = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(stderr);
  const fpsM = /(\d+(?:\.\d+)?)\s*fps/.exec(stderr);
  const rot = /rotate\s*:\s*(-?\d+)|displaymatrix:.*?(-?\d+(?:\.\d+)?) degrees/.exec(stderr);
  let width = vid ? Number(vid[1]) : 0;
  let height = vid ? Number(vid[2]) : 0;
  const rotation = rot ? Math.abs(Number(rot[1] ?? rot[2])) % 360 : 0;
  if (rotation === 90 || rotation === 270) [width, height] = [height, width];
  return { durationSec, width, height, fps: fpsM ? Number(fpsM[1]) : 30, rotation };
}

/** 給 SAM 的低幀率版本：固定 fps、短邊 720、H.264、去音軌。ffmpeg 會自動套用旋轉中繼資料 */
export async function transcodeLowFps(input: string, output: string, fps = 4, maxShort = 720) {
  await run([
    "-y", "-i", input,
    "-vf", `fps=${fps},scale='if(gt(iw,ih),-2,${maxShort})':'if(gt(iw,ih),${maxShort},-2)'`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-an", output,
  ]);
  return output;
}

/** 抽影格（JPEG），檔名 frame_%05d.jpg，從 0 起算；回傳每張的秒數 */
export async function extractFrames(input: string, outDir: string, fps = 2, maxShort = 1080) {
  await fs.mkdir(outDir, { recursive: true });
  await run([
    "-y", "-i", input,
    "-vf", `fps=${fps},scale='if(gt(iw,ih),-2,${maxShort})':'if(gt(iw,ih),${maxShort},-2)'`,
    "-q:v", "3", "-start_number", "0", path.join(outDir, "frame_%05d.jpg"),
  ]);
  const files = (await fs.readdir(outDir)).filter((f) => f.startsWith("frame_")).sort();
  return files.map((f, i) => ({ t: i / fps, file: path.join(outDir, f) }));
}

/** 抽音軌：WAV、單聲道、24 kHz、16-bit（Voice Transcribe 原生取樣率）。沒有音軌回 null */
export async function extractWav(input: string, output: string): Promise<string | null> {
  try {
    await run(["-y", "-i", input, "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-map_metadata", "-1", output]);
    const st = await fs.stat(output);
    return st.size > 1000 ? output : null;
  } catch {
    return null;
  }
}

/** 單張影格（給總覽或封面） */
export async function frameAt(input: string, sec: number, output: string, maxShort = 1080) {
  await run([
    "-y", "-ss", String(sec), "-i", input, "-frames:v", "1",
    "-vf", `scale='if(gt(iw,ih),-2,${maxShort})':'if(gt(iw,ih),${maxShort},-2)'`,
    "-q:v", "2", output,
  ]);
  return output;
}
