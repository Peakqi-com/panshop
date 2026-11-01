"use client";

import { useState } from "react";
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
      <CommentDemo jobId={job._id} />
    </section>
  );
}

function CommentDemo({ jobId }: { jobId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ text: string; reply: string; itemCode: string | null; model: string; ms: number }[]>([]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const r = await fetch("/api/comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, text }) });
    const j = await r.json();
    setLog((l) => [{ text, reply: j.reply ?? j.error, itemCode: j.itemCode ?? null, model: j.model ?? "", ms: j.ms ?? 0 }, ...l]);
    setText("");
    setBusy(false);
  }
  return (
    <div className="mt-10 rounded-lg border bg-white p-4">
      <h3 className="font-semibold">留言對商品</h3>
      <p className="text-xs text-neutral-500">貼上顧客留言，例如「A3 多少」「還有藍色的嗎」。Built with Muse Spark Open（開放權重，Baseten 託管）。</p>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 rounded border px-3 py-2" placeholder="顧客留言…" />
        <button disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">送出</button>
      </form>
      <ul className="mt-3 space-y-2 text-sm">
        {log.map((l, i) => (
          <li key={i} className="rounded bg-neutral-50 p-2">
            <div className="text-neutral-500">顧客：{l.text}</div>
            <div>小編：{l.reply} {l.itemCode && <span className="ml-1 rounded bg-orange-100 px-1 font-mono text-xs text-orange-700">{l.itemCode}</span>}</div>
            <div className="text-[10px] text-neutral-400">{l.model}・{l.ms} ms</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
