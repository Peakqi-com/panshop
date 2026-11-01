import Link from "next/link";
import { fmtTime } from "@/lib/format";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { assets as assetRepo } from "@/repositories/assets";
import { tracks as trackRepo } from "@/repositories/tracks";
import { STAGES, STAGE_LABEL } from "@/lib/stages";
import { RetryButtons, DeleteJobForm } from "../../forms";

export default async function AdminJob({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const job = await jobs.byId(id);
  if (!job?._id) notFound();
  const [its, ass, trs] = await Promise.all([itemRepo.forJob(job._id, { includeDeleted: true }), assetRepo.forJob(job._id), trackRepo.forJob(job._id)]);
  const assetByItem = new Map(ass.map((a) => [String(a.itemId), a]));
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/jobs" className="text-xs text-stone-500 hover:underline">← 掃描工作</Link>
          <h1 className="text-2xl font-bold">{job.shopName || "未命名"} <span className="font-mono text-base text-stone-400">{job.code}</span></h1>
          <p className="text-sm text-stone-500">{fmtTime(job.createdAt)} · 狀態 {job.status} · 風格 {job.style} · 幣別 {job.currency}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href={`/jobs/${job.code}`} target="_blank" className="btn btn-ghost">前台頁面</Link>
          <Link href={`/s/${job.code}`} target="_blank" className="btn btn-ghost">可購買頁</Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5 text-sm">
        <Info label="影片" value={job.video.durationSec ? `${job.video.durationSec.toFixed(1)}s · ${job.video.width}×${job.video.height}` : "—"} />
        <Info label="追蹤段數" value={String(job.metrics.trackCount ?? trs.length)} />
        <Info label="商品" value={`${its.filter((i) => i.status !== "deleted").length}（刪 ${its.filter((i) => i.status === "deleted").length}）`} />
        <Info label="SAM 格數" value={String(job.metrics.samFrames ?? "—")} />
        <Info label="API 成本" value={job.metrics.costUsd != null ? `$${job.metrics.costUsd.toFixed(3)}` : "—"} />
      </div>

      <section className="card mt-4 p-4">
        <h2 className="font-semibold">Stage</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-stone-500"><tr><th className="py-1">Stage</th><th>狀態</th><th className="pr-4 text-right">耗時</th><th>備註／錯誤</th></tr></thead>
          <tbody>
            {STAGES.map((s) => { const v = job.stages[s]; return (
              <tr key={s} className="border-t border-stone-100 align-top">
                <td className="py-1.5 font-medium">{STAGE_LABEL[s]} <span className="font-mono text-xs text-stone-400">{s}</span></td>
                <td className={v?.status === "failed" ? "text-red-700" : v?.status === "done" ? "text-green-700" : "text-stone-500"}>{v?.status ?? "—"}</td>
                <td className="pr-4 text-right font-mono text-xs">{v?.ms ? `${(v.ms / 1000).toFixed(1)}s` : ""}</td>
                <td className="max-w-md break-words text-xs text-stone-600">{v?.note}{v?.error && <span className="text-red-700">{v.error}</span>}</td>
              </tr>
            ); })}
          </tbody>
        </table>
        <div className="mt-3"><RetryButtons jobId={String(job._id)} /></div>
      </section>

      <section className="card mt-4 p-4">
        <h2 className="font-semibold">品類與口述</h2>
        <p className="mt-1 text-sm">{job.categories.map((c) => `${c.name}（${c.phrase}，約 ${c.estimatedCount}）`).join("、") || "—"}</p>
        <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-stone-600">
          {job.transcript.map((t, i) => <li key={i}><span className="font-mono text-stone-400">{t.startSec.toFixed(1)}s</span> {t.text} {t.prices.length > 0 && <span className="text-orange-700">[{t.prices.join(", ")}]</span>}</li>)}
        </ul>
      </section>

      <section className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500"><tr><th className="p-2">圖</th><th className="p-2">代碼</th><th className="p-2">品名</th><th className="p-2">品類</th><th className="p-2 text-right">價格</th><th className="p-2">信心</th><th className="p-2">依據</th><th className="p-2">狀態</th><th className="p-2">產出</th></tr></thead>
          <tbody>
            {its.map((it) => { const a = assetByItem.get(String(it._id)); return (
              <tr key={String(it._id)} className={`border-t border-stone-100 ${it.status === "deleted" ? "opacity-50" : ""}`}>
                <td className="p-2"><img src={it.primaryCutoutUrl ?? it.primaryCropUrls[0]} alt="" className="h-10 w-10 rounded bg-white object-contain ring-1 ring-stone-200" /></td>
                <td className="p-2 font-mono text-xs">{it.code}</td>
                <td className="p-2">{it.title}</td>
                <td className="p-2 text-xs text-stone-500">{it.category}</td>
                <td className="p-2 text-right">{it.price ?? "—"}</td>
                <td className="p-2 text-xs">{Math.round(it.confidence.overall * 100)}%</td>
                <td className="p-2 text-xs text-stone-500">{it.sources.speech ? "畫面＋口述" : "畫面"}</td>
                <td className="p-2 text-xs">{it.status}</td>
                <td className="p-2 text-xs">{[a?.studioUrl && "棚拍", a?.lifestyleUrl && "情境", a?.reelUrl && "短片"].filter(Boolean).join("、") || "—"}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </section>

      <section className="card mt-4 border-red-200 p-4">
        <h2 className="font-semibold text-red-800">刪除這個工作</h2>
        <p className="mt-1 text-sm text-stone-600">會刪除資料庫紀錄與 Blob 上的影格、裁圖、商品圖與短影片（原始上傳影片保留）。無法復原。</p>
        <DeleteJobForm jobId={String(job._id)} code={job.code} />
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="card p-3"><div className="text-xs text-stone-500">{label}</div><div className="mt-0.5 font-medium">{value}</div></div>;
}
