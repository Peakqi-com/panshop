"use client";

import { useEffect, useRef, useState } from "react";
import type { JobPayload, TrackRow, ItemRow } from "./job-view";

/** 影片 + 時間軸：播放頭所在秒數，哪些商品在鏡頭內就亮起；同一件多段仍是一件 */
export function Timeline({ job, tracks, items }: { job: JobPayload["job"]; tracks: TrackRow[]; items: ItemRow[] }) {
  const video = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const dur = job.video.durationSec ?? 1;
  const byTrack = new Map<string, ItemRow>();
  for (const it of items) for (const id of it.trackIds) byTrack.set(id, it);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const h = () => setT(v.currentTime);
    v.addEventListener("timeupdate", h);
    return () => v.removeEventListener("timeupdate", h);
  }, []);

  const live = tracks.filter((tr) => t >= tr.startSec && t <= tr.endSec);
  const liveItems = new Set(live.map((tr) => byTrack.get(tr._id)?._id).filter(Boolean));
  const pw = job.video.procWidth ?? 1, ph = job.video.procHeight ?? 1;

  return (
    <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={video} src={job.video.fps4Url ?? job.video.originalUrl} controls playsInline className="w-full" />
        <div className="pointer-events-none absolute inset-0">
          {live.map((tr) => {
            const b = nearestBox(tr, t);
            const it = byTrack.get(tr._id);
            if (!b || !it) return null;
            return (
              <div key={tr._id} className="absolute rounded border-2 border-orange-400" style={{ left: `${(b.x1 / pw) * 100}%`, top: `${(b.y1 / ph) * 100}%`, width: `${((b.x2 - b.x1) / pw) * 100}%`, height: `${((b.y2 - b.y1) / ph) * 100}%` }}>
                <span className="absolute -top-5 left-0 rounded bg-orange-500 px-1 text-xs text-white">{it.code}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rounded-lg border bg-white p-3">
        <p className="text-xs text-neutral-500">{t.toFixed(1)}s／{dur.toFixed(0)}s・鏡頭內 {liveItems.size} 件</p>
        <ul className="mt-2 space-y-1">
          {items.map((it) => {
            const segs = tracks.filter((tr) => it.trackIds.includes(tr._id));
            const on = liveItems.has(it._id);
            return (
              <li key={it._id} className={`flex items-center gap-2 rounded px-1 py-0.5 text-sm ${on ? "bg-orange-50 font-medium" : "text-neutral-500"}`}>
                <span className="w-7 font-mono text-xs">{it.code}</span>
                <span className="relative h-2 flex-1 rounded bg-neutral-100">
                  {segs.map((s) => <span key={s._id} className={`absolute top-0 h-2 rounded ${on ? "bg-orange-500" : "bg-neutral-300"}`} style={{ left: `${(s.startSec / dur) * 100}%`, width: `${Math.max(0.5, ((s.endSec - s.startSec) / dur) * 100)}%` }} />)}
                </span>
                <span className="w-8 text-right text-xs text-neutral-400">{segs.length > 1 ? `${segs.length} 段` : ""}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function nearestBox(tr: TrackRow, t: number) {
  let best = tr.boxes[0], d = Infinity;
  for (const b of tr.boxes) { const dd = Math.abs(b.t - t); if (dd < d) { d = dd; best = b; } }
  return d <= 0.6 ? best : null;
}
