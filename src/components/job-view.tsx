"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT, useLang } from "@/components/lang";
import { fmtTimeL, STAGE_LABEL_EN } from "@/lib/i18n";
import { STAGES, STAGE_LABEL, AUTO_STAGES, PRODUCE_STAGES, estimateRemaining, type Stage } from "@/lib/stages";
import { ReviewTable } from "./review-table";
import { Timeline } from "./timeline";
import { Outputs } from "./outputs";

export type JobPayload = {
  job: {
    _id: string; code: string; status: string; shopName: string; currency: string; createdAt: string; style: string; source: "video" | "photos" | "replay";
    video: { originalUrl?: string; fps4Url?: string; durationSec?: number; procWidth?: number; procHeight?: number; procFps?: number };
    frames: { t: number; url: string }[];
    categories: { name: string; phrase: string; estimatedCount: number }[];
    transcript: { startSec: number; endSec: number; text: string; names: string[]; prices: number[] }[];
    stages: Partial<Record<Stage, { status: string; ms?: number; error?: string; note?: string; startedAt?: string }>>;
    metrics: { trackCount?: number; itemCount?: number; costUsd?: number; samFrames?: number };
    catalogCsvUrl?: string;
    contact?: { instagram: string; line: string; phone: string };
  };
  canEdit: boolean;
  isAdmin: boolean;
  items: ItemRow[];
  tracks: TrackRow[];
  assets: AssetRow[];
};
export type ItemRow = {
  _id: string; code: string; status: string; trackIds: string[]; category: string; primaryCropUrls: string[]; primaryCutoutUrl?: string; heroUrl?: string;
  title: string; color: string; material: string; price: number | null; currency: string; description: string;
  confidence: { title: number; price: number; overall: number }; sources: { vision: boolean; speech: boolean }; speechEvidence: string;
};
export type TrackRow = { _id: string; category: string; samObjectId: string; startSec: number; endSec: number; boxes: { t: number; x1: number; y1: number; x2: number; y2: number; w: number; h: number }[] };
export type AssetRow = { itemId: string; cutoutUrl?: string; studioUrl?: string; lifestyleUrl?: string; coverUrl?: string; reelUrl?: string; shots?: { kind: string; label: string; url: string }[]; caption: string; captionShort?: string; captionLong?: string; hook?: string; sellingPoints?: string[]; voiceover?: string; history?: { kind: string; url: string }[]; status: string; storyboard?: StoryboardRow };
export type SceneRow = { sceneNo: number; durationSec: number; purpose: string; shot: string; imagePrompt: string; motion: string; narration: string; subtitle: string; overlay: string; imageUrl?: string };
export type StoryboardRow = { hook: string; cta: string; scenes: SceneRow[]; voice?: string; music?: string; musicLabel?: string; gallery?: string[] };

const STAGE_HINT: Record<Stage, [string, string]> = {
  extract: ["讀取影片或照片、抽出影格與音軌", "Reading the video or photos, extracting frames and audio"],
  discover: ["Muse Spark 看總覽影格，列出商品品類", "Muse Spark looks at overview frames and lists product categories"],
  segment: ["SAM 3.1 逐品類切出每一件並跨格追蹤", "SAM 3.1 segments every item per category and tracks it across frames"],
  dedup: ["同一件出鏡再入鏡只算一次", "An item that leaves and re-enters the frame is counted once"],
  transcribe: ["Muse Voice 聽你說的品名與價格", "Muse Voice Transcribe listens for the names and prices you say"],
  identify: ["Muse Spark 寫品名、屬性、描述", "Muse Spark writes titles, attributes and descriptions"],
  shoot: ["Muse Image 生成棚拍圖與情境圖", "Muse Image generates studio and lifestyle photos"],
  render: ["文案、目錄 CSV、每件一支短影片", "Copy, catalog CSV and a short video per item"],
};

export function JobView({ code }: { code: string }) {
  const [data, setData] = useState<JobPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const prevStatus = useRef<string | null>(null);
  const t = useT();
  const lang = useLang();

  const load = useCallback(async () => {
    const r = await fetch(`/api/jobs/${code}?full=1`, { cache: "no-store" });
    if (!r.ok) { setErr(t("找不到這個掃描", "Scan not found")); return; }
    const d = (await r.json()) as JobPayload;
    setData(d);
  }, [code, t]);

  const statusRef = useRef<string>("uploaded");
  useEffect(() => {
    const s = data?.job.status ?? "uploaded";
    statusRef.current = s;
    if (prevStatus.current && prevStatus.current !== s && s === "review") setBurstKey((k) => k + 1);
    prevStatus.current = s;
  }, [data]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(() => { if (["processing", "uploaded", "producing"].includes(statusRef.current)) load(); }, 2500);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [load]);

  // 保險：進行中卻沒有任何 stage 在跑（上一個 stage 沒成功啟動下一個），超過 8 秒就請伺服器接起來
  const idleSince = useRef<number | null>(null);
  useEffect(() => {
    if (!data) return;
    const busyNow = ["processing", "uploaded", "producing"].includes(data.job.status);
    const running = Object.values(data.job.stages).some((s) => s?.status === "running");
    if (!busyNow || running) { idleSince.current = null; return; }
    idleSince.current ??= Date.now();
    if (Date.now() - idleSince.current > 8000) {
      idleSince.current = Date.now();
      fetch(`/api/jobs/${data.job._id}/kick`, { method: "POST" }).catch(() => {});
    }
  }, [data]);

  const busy = !!data && ["processing", "uploaded", "producing"].includes(data.job.status);
  const stageList = useMemo(() => STAGES.map((s) => ({ key: s, label: lang === "en" ? STAGE_LABEL_EN[s] : STAGE_LABEL[s], ...(data?.job.stages?.[s] ?? { status: "pending" }) })), [data, lang]);
  const current = stageList.find((s) => s.status === "running") ?? stageList.find((s) => s.status === "failed");

  if (err) return <main className="mx-auto max-w-3xl p-8 text-stone-600">{err}</main>;
  if (!data) return <main className="mx-auto max-w-6xl p-8"><div className="skeleton h-8 w-48 rounded" /><div className="skeleton mt-6 h-40 rounded-xl" /></main>;
  const { job } = data;
  const inReview = ["review", "producing", "done"].includes(job.status);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-stone-500">{job.source === "photos" ? t("照片匯入", "Photo import") : job.source === "replay" ? t("直播回放", "Live replay") : t("影片掃描", "Video scan")} <span className="font-mono">{job.code}</span> · {fmtTimeL(job.createdAt, lang)}</p>
          <h1 className="text-2xl font-bold">{job.shopName || t("我的商品", "My products")}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {job.metrics.itemCount != null && <Stat label={t("商品", "Items")} value={`${job.metrics.itemCount}${t(" 件", "")}`} />}
          {job.video.durationSec != null && <Stat label={t("影片", "Video")} value={`${Math.round(job.video.durationSec)}${t(" 秒", "s")}`} />}
          {job.metrics.costUsd != null && <Stat label={t("API 成本", "API cost")} value={`$${job.metrics.costUsd.toFixed(3)}`} />}
        </div>
      </header>

      {/* 進度 */}
      <section className="card mt-6 p-4">
        <ol className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {stageList.map((s, i) => (
            <li key={s.key} title={s.note ?? s.error ?? ""} className={`relative rounded-lg px-2 py-2 text-xs ${s.status === "done" ? "bg-green-50 text-green-800" : s.status === "running" ? "bg-orange-50 text-orange-800 ring-1 ring-orange-300" : s.status === "failed" ? "bg-red-50 text-red-800" : "text-stone-400"}`}>
              <div className="flex items-center gap-1 font-medium">
                <span className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${s.status === "done" ? "bg-green-600 text-white" : s.status === "running" ? "animate-pulse bg-orange-500 text-white" : s.status === "failed" ? "bg-red-600 text-white" : "bg-stone-200 text-stone-500"}`}>{s.status === "done" ? "✓" : i + 1}</span>
                {s.label}
              </div>
              <div className="mt-0.5 truncate">{s.status === "done" ? (s.ms ? `${(s.ms / 1000).toFixed(0)}${t(" 秒", "s")}` : t("完成", "Done")) : s.status === "running" ? t("進行中…", "Running…") : s.status === "failed" ? t("失敗", "Failed") : ""}</div>
            </li>
          ))}
        </ol>
        {busy && (() => {
          const chain = job.status === "producing" ? PRODUCE_STAGES : AUTO_STAGES;
          const eta = estimateRemaining(job.stages, chain, job.video.durationSec, job.metrics.itemCount);
          return <p className="mt-3 text-sm text-stone-600">{current && current.status === "running" ? `${t(...STAGE_HINT[current.key])}…` : t("排隊中…", "Queued…")}<span className="ml-2 text-stone-400">{t("預估還要約 ", "About ")}{eta >= 90 ? t(`${Math.ceil(eta / 60)} 分鐘`, `${Math.ceil(eta / 60)} min left`) : t(`${eta} 秒`, `${eta}s left`)}</span></p>;
        })()}
        {job.status === "failed" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div className="font-medium">{current ? t(`${current.label} 失敗`, `${current.label} failed`) : t("處理失敗", "Processing failed")}</div>
            <div className="mt-1 break-all text-xs">{current?.error}</div>
            {data.isAdmin ? <RetryButton jobId={job._id} stage={current?.key ?? "extract"} onDone={load} /> : <p className="mt-2 text-xs">{t("我們會收到這次失敗的紀錄。你也可以換一段影片重新上傳。", "We log every failure. You can also try uploading a different video.")}</p>}
          </div>
        )}
      </section>

      {/* 處理中：影格與品類 */}
      {busy && (
        <section className="mt-6 rise">
          {job.frames.length ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {job.frames.map((f) => <img key={f.url} src={f.url} alt="" className="aspect-video rounded-lg object-cover" />)}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton aspect-video rounded-lg" />)}</div>
          )}
          {job.categories.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-stone-500">{t("找到品類：", "Categories found:")}</span>
              {job.categories.map((c) => <span key={c.name} className="rounded-full bg-white px-3 py-1 ring-1 ring-stone-200">{c.name} <span className="text-stone-400">{t(`約 ${c.estimatedCount} 件`, `~${c.estimatedCount}`)}</span></span>)}
            </div>
          )}
          {job.metrics.trackCount != null && <p className="mt-2 text-sm text-stone-500">{t(`追蹤到 ${job.metrics.trackCount} 段影像`, `${job.metrics.trackCount} tracks found`)}{job.metrics.itemCount != null ? t(`，去重後 ${job.metrics.itemCount} 件`, `, ${job.metrics.itemCount} items after de-duplication`) : t("，正在去重…", ", de-duplicating…")}</p>}
        </section>
      )}

      {!data.canEdit && <p className="mt-4 rounded-lg bg-stone-100 px-4 py-2 text-sm text-stone-600">{t("這是唯讀檢視。只有建立這個掃描的瀏覽器可以修改；想試試看，請回首頁上傳你自己的影片或照片。", "Read-only view. Only the browser that created this scan can edit it. To try it yourself, upload your own video or photos from the home page.")}</p>}
      {/* 產出完成：成品放最前面，分析過程收合 */}
      {["producing", "done"].includes(job.status) && <Outputs data={{ ...data, items: data.items.filter((i) => i.status !== "deleted") }} onChange={load} />}
      {inReview && (job.status === "review" ? (
        <>
          <BurstGrid key={burstKey} items={data.items.filter((i) => i.status !== "deleted")} assets={data.assets} animate={burstKey > 0} />
          <Timeline job={job} tracks={data.tracks} items={data.items.filter((i) => i.status !== "deleted")} />
          <ReviewTable data={data} onChange={load} />
        </>
      ) : (
        <details className="mt-10 rounded-xl bg-white p-4 ring-1 ring-stone-200">
          <summary className="cursor-pointer font-semibold">{t("分析過程：切出的商品、時間軸、確認表", "How it was analyzed: cut-out items, timeline, review table")}</summary>
          <BurstGrid items={data.items.filter((i) => i.status !== "deleted")} assets={data.assets} animate={false} />
          <Timeline job={job} tracks={data.tracks} items={data.items.filter((i) => i.status !== "deleted")} />
          <ReviewTable data={data} onChange={load} />
        </details>
      ))}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-stone-200"><span className="text-xs text-stone-500">{label} </span><span className="font-medium">{value}</span></div>;
}

function RetryButton({ jobId, stage, onDone }: { jobId: string; stage: Stage; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const t = useT();
  const lang = useLang();
  return (
    <>
      <button disabled={busy} onClick={async () => { setBusy(true); const r = await fetch(`/api/jobs/${jobId}/retry`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage }) }); if (!r.ok) setErr((await r.json().catch(() => ({}))).error ?? t("重試失敗", "Retry failed")); setBusy(false); onDone(); }} className="btn btn-ghost mt-2 text-xs">
        {busy ? t("重試中…", "Retrying…") : lang === "en" ? `Re-run from “${STAGE_LABEL_EN[stage]}”` : `從「${STAGE_LABEL[stage]}」重跑`}
      </button>
      {err && <span className="ml-2 text-xs text-red-700">{err}</span>}
    </>
  );
}

/** 驚艷 1：影片處理完，商品卡從中央炸開 */
function BurstGrid({ items, assets, animate }: { items: ItemRow[]; assets: AssetRow[]; animate: boolean }) {
  const t = useT();
  const shotOf = (id: string) => { const a = assets.find((x) => x.itemId === id); return a?.shots?.find((s) => s.kind === "threeQuarter")?.url ?? a?.shots?.[0]?.url; };
  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{t(`切出 ${items.length} 件商品`, `${items.length} items cut out`)}</h2>
        <p className="text-sm text-stone-500">{t("同一件出鏡再入鏡只算一次", "An item that leaves and re-enters the frame is counted once")}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((it, i) => {
          const cols = 6, r = Math.floor(i / cols), c = i % cols;
          const dx = `${(cols / 2 - c - 0.5) * 120}px`, dy = `${(1 - r) * 160}px`;
          return (
            <div key={it._id} className={`card overflow-hidden ${animate ? "burst" : ""}`} style={{ animationDelay: `${i * 60}ms`, ["--dx" as string]: dx, ["--dy" as string]: dy } as React.CSSProperties}>
              <div className="aspect-square bg-white"><img src={it.heroUrl ?? shotOf(it._id) ?? it.primaryCutoutUrl ?? it.primaryCropUrls[0]} alt={it.title} className="h-full w-full object-contain" /></div>
              <div className="px-2 py-1.5">
                <div className="flex items-baseline justify-between"><span className="font-mono text-[10px] text-stone-400">{it.code}</span><span className="text-xs font-medium">{it.price != null ? `$${it.price}` : ""}</span></div>
                <div className="truncate text-xs">{it.title || it.category}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
