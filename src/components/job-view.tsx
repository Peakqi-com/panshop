"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STAGES, STAGE_LABEL } from "@/lib/stages";
import { ReviewTable } from "./review-table";
import { Timeline } from "./timeline";
import { Outputs } from "./outputs";

export type JobPayload = {
  job: {
    _id: string; code: string; status: string; shopName: string; currency: string;
    video: { originalUrl: string; fps4Url?: string; durationSec?: number; procWidth?: number; procHeight?: number; procFps?: number };
    frames: { t: number; url: string }[];
    categories: { name: string; phrase: string; estimatedCount: number }[];
    transcript: { startSec: number; endSec: number; text: string; names: string[]; prices: number[] }[];
    stages: Record<string, { status: string; ms?: number; error?: string; note?: string }>;
    metrics: { trackCount?: number; itemCount?: number; costUsd?: number; samFrames?: number };
    catalogCsvUrl?: string;
  };
  items: ItemRow[];
  tracks: TrackRow[];
  assets: AssetRow[];
};
export type ItemRow = {
  _id: string; code: string; status: string; trackIds: string[]; category: string; primaryCropUrls: string[]; primaryCutoutUrl?: string;
  title: string; color: string; material: string; price: number | null; currency: string; description: string;
  confidence: { title: number; price: number; overall: number }; sources: { vision: boolean; speech: boolean }; speechEvidence: string;
};
export type TrackRow = { _id: string; category: string; samObjectId: string; startSec: number; endSec: number; boxes: { t: number; x1: number; y1: number; x2: number; y2: number; w: number; h: number }[] };
export type AssetRow = { itemId: string; cutoutUrl?: string; studioUrl?: string; lifestyleUrl?: string; coverUrl?: string; reelUrl?: string; caption: string; status: string };

export function JobView({ code }: { code: string }) {
  const [data, setData] = useState<JobPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/jobs/${code}?full=1`, { cache: "no-store" });
    if (!r.ok) { setErr("找不到這個工作"); return; }
    setData(await r.json());
  }, [code]);

  const statusRef = useRef<string>("uploaded");
  useEffect(() => {
    statusRef.current = data?.job.status ?? "uploaded";
  }, [data]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(() => {
      if (["processing", "uploaded", "producing"].includes(statusRef.current)) load();
    }, 2500);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [load]);

  const busy = data && ["processing", "uploaded", "producing"].includes(data.job.status);
  const stageList = useMemo(() => STAGES.map((s) => ({ key: s, label: STAGE_LABEL[s], ...(data?.job.stages?.[s] ?? { status: "pending" }) })), [data]);

  if (err) return <main className="p-8">{err}</main>;
  if (!data) return <main className="p-8 text-neutral-500">載入中…</main>;
  const { job } = data;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs text-neutral-500">PanShop・{job.code}</p>
          <h1 className="text-2xl font-semibold">{job.shopName || "我的商品"}</h1>
        </div>
        <div className="text-sm text-neutral-600">
          {job.metrics.itemCount != null && <span className="mr-3">{job.metrics.itemCount} 件</span>}
          {job.metrics.costUsd != null && <span>API 成本 ${job.metrics.costUsd.toFixed(3)}</span>}
        </div>
      </header>

      <ol className="mt-6 grid grid-cols-4 gap-2 text-xs sm:grid-cols-8">
        {stageList.map((s) => (
          <li key={s.key} className={`rounded-md border px-2 py-2 ${s.status === "done" ? "border-green-200 bg-green-50 text-green-800" : s.status === "running" ? "animate-pulse border-orange-300 bg-orange-50 text-orange-800" : s.status === "failed" ? "border-red-300 bg-red-50 text-red-800" : "text-neutral-400"}`} title={s.note ?? s.error ?? ""}>
            <div className="font-medium">{s.label}</div>
            <div className="truncate">{s.status === "done" ? (s.note ?? `${Math.round((s.ms ?? 0) / 1000)}s`) : s.status === "running" ? "進行中…" : s.status === "failed" ? "失敗" : "等待"}</div>
          </li>
        ))}
      </ol>
      {job.status === "failed" && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          失敗：{Object.values(job.stages).find((s) => s.status === "failed")?.error}
        </p>
      )}

      {busy && (
        <section className="mt-8">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {job.frames.map((f) => <img key={f.url} src={f.url} alt="" className="aspect-video rounded object-cover" />)}
          </div>
          {job.categories.length > 0 && <p className="mt-3 text-sm text-neutral-600">找到品類：{job.categories.map((c) => `${c.name}（約 ${c.estimatedCount} 件）`).join("、")}</p>}
        </section>
      )}

      {["review", "producing", "done"].includes(job.status) && (
        <>
          <Timeline job={job} tracks={data.tracks} items={data.items} />
          <ReviewTable data={data} onChange={load} />
        </>
      )}
      {["producing", "done"].includes(job.status) && <Outputs data={data} />}
    </main>
  );
}
