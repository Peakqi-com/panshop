"use client";

import type { JobPayload } from "./job-view";

export function Outputs({ data }: { data: JobPayload }) {
  const { job, items, assets } = data;
  const byItem = new Map(assets.map((a) => [a.itemId, a]));
  const shopUrl = typeof window !== "undefined" ? `${window.location.origin}/s/${job.code}` : `/s/${job.code}`;
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">產出</h2>
        <div className="flex gap-2 text-sm">
          {job.catalogCsvUrl && <a href={job.catalogCsvUrl} className="rounded border bg-white px-3 py-1.5">下載 Meta 目錄 CSV</a>}
          <a href={`/s/${job.code}`} target="_blank" className="rounded border bg-white px-3 py-1.5">開啟可購買頁</a>
          <button onClick={() => navigator.clipboard.writeText(shopUrl)} className="rounded border bg-white px-3 py-1.5">複製網址</button>
        </div>
      </div>
      {job.status === "producing" && <p className="mt-2 text-sm text-neutral-500">正在生成商品圖與短影片…</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => {
          const a = byItem.get(it._id);
          return (
            <article key={it._id} className="overflow-hidden rounded-lg border bg-white">
              {a?.reelUrl ? <video src={a.reelUrl} poster={a.coverUrl} controls playsInline className="aspect-[9/16] w-full bg-black object-cover" />
                : <img src={a?.studioUrl ?? a?.cutoutUrl ?? it.primaryCutoutUrl ?? it.primaryCropUrls[0]} alt="" className="aspect-square w-full object-cover" />}
              <div className="p-3">
                <div className="flex items-baseline justify-between"><span className="font-mono text-xs text-neutral-400">{it.code}</span><span className="font-medium">{it.price != null ? `${it.currency} ${it.price}` : "未定價"}</span></div>
                <h3 className="mt-1 font-medium">{it.title}</h3>
                {a?.caption && <p className="mt-1 line-clamp-3 text-xs text-neutral-500">{a.caption}</p>}
                {(a?.studioUrl || a?.lifestyleUrl) && (
                  <div className="mt-2 flex gap-1">{[a.cutoutUrl, a.studioUrl, a.lifestyleUrl].filter(Boolean).map((u) => <img key={u} src={u} alt="" className="h-12 w-12 rounded object-cover" />)}</div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
