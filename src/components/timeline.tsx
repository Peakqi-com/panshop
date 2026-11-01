"use client";

import { useEffect, useRef, useState } from "react";
import type { JobPayload, TrackRow, ItemRow } from "./job-view";

/** 驚艷 2：播放頭走到哪，哪些商品在鏡頭內就亮起；同一件多段仍是一件 */
export function Timeline({ job, tracks, items }: { job: JobPayload["job"]; tracks: TrackRow[]; items: ItemRow[] }) {
  const video = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const dur = job.video.durationSec ?? 1;
  const byTrack = new Map<string, ItemRow>();
  for (const it of items) for (const id of it.trackIds) byTrack.set(id, it);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let raf = 0;
    const tick = () => { setT(v.currentTime); raf = requestAnimationFrame(tick); };
    const start = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
    const stop = () => { cancelAnimationFrame(raf); setT(v.currentTime); };
    v.addEventListener("play", start); v.addEventListener("pause", stop); v.addEventListener("seeked", stop);
    return () => { cancelAnimationFrame(raf); v.removeEventListener("play", start); v.removeEventListener("pause", stop); v.removeEventListener("seeked", stop); };
  }, []);

  const live = tracks.filter((tr) => t >= tr.startSec && t <= tr.endSec && byTrack.has(tr._id));
  const liveItems = new Set(live.map((tr) => byTrack.get(tr._id)!._id));
  const pw = job.video.procWidth ?? 1, ph = job.video.procHeight ?? 1;
  const seek = (sec: number) => { const v = video.current; if (v) { v.currentTime = sec + 0.05; v.pause(); setT(sec); } };
  const multi = items.filter((it) => tracks.filter((tr) => it.trackIds.includes(tr._id)).length > 1).length;

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">時間軸</h2>
        <p className="text-sm text-stone-500">拖動影片，看每件商品在鏡頭內的秒數。{multi > 0 && <span className="text-orange-700">{multi} 件出鏡又入鏡，仍只算一件。</span>}</p>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} src={job.video.fps4Url ?? job.video.originalUrl} controls playsInline preload="metadata" className="w-full" />
          <div className="pointer-events-none absolute inset-0">
            {live.map((tr) => {
              const b = nearestBox(tr, t);
              const it = byTrack.get(tr._id);
              if (!b || !it) return null;
              return (
                <div key={tr._id} className="absolute rounded-md border-2 border-orange-400 shadow-[0_0_0_2px_rgba(0,0,0,.25)]" style={{ left: `${(b.x1 / pw) * 100}%`, top: `${(b.y1 / ph) * 100}%`, width: `${((b.x2 - b.x1) / pw) * 100}%`, height: `${((b.y2 - b.y1) / ph) * 100}%` }}>
                  <span className="absolute -top-6 left-0 rounded bg-orange-500 px-1.5 py-0.5 text-xs font-medium text-white">{it.code} {it.title}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card p-3">
          <div className="flex items-baseline justify-between text-xs text-stone-500"><span>{t.toFixed(1)}s ／ {dur.toFixed(0)}s</span><span>鏡頭內 {liveItems.size} 件</span></div>
          <ul className="mt-2 max-h-[420px] space-y-1 overflow-y-auto pr-1">
            {items.map((it) => {
              const segs = tracks.filter((tr) => it.trackIds.includes(tr._id)).sort((a, b) => a.startSec - b.startSec);
              const on = liveItems.has(it._id);
              return (
                <li key={it._id} onClick={() => segs[0] && seek(segs[0].startSec)} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm ${on ? "bg-orange-50 font-medium" : "text-stone-500 hover:bg-stone-50"}`}>
                  <img src={it.primaryCutoutUrl ?? it.primaryCropUrls[0]} alt="" className="h-7 w-7 rounded bg-white object-contain ring-1 ring-stone-200" />
                  <span className="w-7 font-mono text-xs">{it.code}</span>
                  <span className="relative h-2.5 flex-1 rounded-full bg-stone-100">
                    {segs.map((s) => <span key={s._id} className={`absolute top-0 h-2.5 rounded-full ${on ? "bg-orange-500" : "bg-stone-300"}`} style={{ left: `${(s.startSec / dur) * 100}%`, width: `${Math.max(0.8, ((s.endSec - s.startSec) / dur) * 100)}%` }} />)}
                    <span className="absolute -top-0.5 h-3.5 w-0.5 bg-stone-800" style={{ left: `${(t / dur) * 100}%` }} />
                  </span>
                  <span className="w-10 text-right text-[11px] text-stone-400">{segs.length > 1 ? `${segs.length} 段` : ""}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

function nearestBox(tr: TrackRow, t: number) {
  let best = tr.boxes[0], d = Infinity;
  for (const b of tr.boxes) { const dd = Math.abs(b.t - t); if (dd < d) { d = dd; best = b; } }
  return d <= 0.6 ? best : null;
}
