/**
 * 決定這支短片的音樂。choice：auto（依風格從曲庫挑，沒有曲目就用程式合成）、synth、none、或曲目 id。
 * 曲庫曲目會循環到片長、統一響度並淡入淡出。回傳 undefined＝交給 renderAdV2 用程式合成。
 */
import path from "node:path";
import { download, run } from "@/lib/ffmpeg";
import { music } from "@/repositories/music";

const hash = (s: string) => Array.from(s).reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

export async function resolveMusic(choice: string | undefined, style: string, code: string, seconds: number, dir: string, log: (m: string) => void): Promise<{ path?: string; label: string }> {
  const len = (seconds + 0.5).toFixed(2);
  const c = choice || "auto";
  if (c === "synth") return { label: "程式合成" };
  if (c === "none") {
    const out = path.join(dir, "silence.wav");
    await run(["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", len, out]);
    return { path: out, label: "無" };
  }
  const track = c === "auto"
    ? await music.active().then((all) => {
        const fit = all.filter((t) => t.styles.includes(style));
        const pool = fit.length ? fit : all.filter((t) => !t.styles.length);
        return pool.length ? pool[hash(code) % pool.length] : null;
      }).catch(() => null)
    : await music.byId(c);
  if (!track) return { label: "程式合成" };
  try {
    const src = await download(track.url, path.join(dir, "track.audio"));
    const out = path.join(dir, "track.wav");
    const fadeAt = Math.max(0, seconds + 0.5 - 1.5).toFixed(2);
    await run(["-y", "-stream_loop", "-1", "-i", src, "-t", len, "-af", `loudnorm=I=-20:TP=-2:LRA=11,afade=t=in:d=0.3,afade=t=out:st=${fadeAt}:d=1.5,aformat=sample_rates=44100:channel_layouts=stereo`, out], { timeoutMs: 90_000 });
    return { path: out, label: track.title };
  } catch (e) {
    log(`${code} 曲目「${track.title}」處理失敗，改用程式合成：${(e as Error).message.slice(0, 120)}`);
    return { label: "程式合成" };
  }
}
