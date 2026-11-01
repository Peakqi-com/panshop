"use client";

import { useState } from "react";
import type { JobPayload } from "./job-view";

type Tab = "cards" | "reels" | "catalog";

export function Outputs({ data, onChange }: { data: JobPayload; onChange: () => void }) {
  const { job, items, assets } = data;
  const byItem = new Map(assets.map((a) => [a.itemId, a]));
  const [tab, setTab] = useState<Tab>("cards");
  const [copied, setCopied] = useState(false);
  const shopPath = `/s/${job.code}`;
  const producing = job.status === "producing";
  const reelsDone = assets.filter((a) => a.reelUrl).length;
  const shotsDone = assets.filter((a) => a.studioUrl || a.lifestyleUrl).length;
  void onChange;

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}${shopPath}`);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">產出</h2>
          <p className="text-sm text-stone-500">{producing ? `正在生成商品圖 ${shotsDone}/${items.length}、短影片 ${reelsDone}/${items.length}…` : `${items.length} 件商品、${reelsDone} 支短影片`}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <a href={`/api/jobs/${job._id}/catalog.csv`} className="btn btn-ghost">下載 Meta 目錄 CSV</a>
          <a href={shopPath} target="_blank" className="btn btn-ghost">開啟可購買頁</a>
          <button onClick={copyLink} className="btn btn-ghost">{copied ? "已複製" : "複製網址"}</button>
        </div>
      </div>

      <div className="mt-4 flex gap-1 rounded-lg bg-stone-100 p-1 text-sm w-fit">
        {([["cards", "商品卡"], ["reels", "短影片"], ["catalog", "目錄與頁面"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-white shadow-sm" : "text-stone-500"}`}>{l}</button>
        ))}
      </div>

      {tab === "cards" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it) => {
            const a = byItem.get(it._id);
            const hero = a?.studioUrl ?? a?.cutoutUrl ?? it.primaryCutoutUrl ?? it.primaryCropUrls[0];
            return (
              <article key={it._id} className="card overflow-hidden">
                <div className="aspect-square bg-white">{hero ? <img src={hero} alt="" className="h-full w-full object-contain" /> : <div className="skeleton h-full w-full" />}</div>
                <div className="p-3">
                  <div className="flex items-baseline justify-between"><span className="font-mono text-xs text-stone-400">{it.code}</span><span className="font-semibold">{it.price != null ? `${it.currency} ${it.price.toLocaleString()}` : "未定價"}</span></div>
                  <h3 className="mt-1 font-medium leading-snug">{it.title}</h3>
                  <div className="mt-2 flex gap-1">
                    {[a?.cutoutUrl ?? it.primaryCutoutUrl, a?.studioUrl, a?.lifestyleUrl].map((u, i) => u ? <img key={i} src={u} alt="" className="h-12 w-12 rounded-md object-cover ring-1 ring-stone-200" /> : <div key={i} className={`h-12 w-12 rounded-md ${producing ? "skeleton" : "bg-stone-100"}`} />)}
                  </div>
                  {a?.caption ? <p className="mt-2 whitespace-pre-line text-xs text-stone-500">{a.caption}</p> : producing ? <div className="skeleton mt-2 h-10 rounded" /> : null}
                  {a?.caption && <button onClick={() => navigator.clipboard.writeText(a.caption)} className="mt-2 text-xs text-stone-500 underline">複製文案</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === "reels" && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((it) => {
            const a = byItem.get(it._id);
            return (
              <div key={it._id} className="overflow-hidden rounded-xl bg-black">
                {a?.reelUrl ? <video src={a.reelUrl} poster={a.coverUrl} controls playsInline muted className="aspect-[9/16] w-full object-cover" />
                  : <div className={`aspect-[9/16] w-full ${producing ? "skeleton" : "bg-stone-800"}`} />}
                <div className="flex items-center justify-between px-2 py-1.5 text-xs text-stone-300"><span>{it.code}</span>{a?.reelUrl && <a href={a.reelUrl} download className="underline">下載</a>}</div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "catalog" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card p-4 text-sm">
            <h3 className="font-semibold">Meta 商品目錄</h3>
            <p className="mt-1 text-stone-600">CSV 欄位依 Commerce Manager 規格（id、title、description、availability、condition、price、link、image_link、brand、google_product_category）。到 Commerce Manager → 目錄 → 新增商品 → 資料來源 → 上傳檔案即可。</p>
            <a href={`/api/jobs/${job._id}/catalog.csv`} className="btn btn-primary mt-3">下載 CSV（{items.length} 列）</a>
          </div>
          <div className="card p-4 text-sm">
            <h3 className="font-semibold">可購買頁</h3>
            <p className="mt-1 text-stone-600">一個網址，放進 IG 個人簡介或貼文留言。顧客看到代碼就能留言下單。</p>
            <div className="mt-3 flex gap-2"><input readOnly value={typeof window !== "undefined" ? `${window.location.origin}${shopPath}` : shopPath} className="input font-mono text-xs" /><button onClick={copyLink} className="btn btn-ghost whitespace-nowrap">{copied ? "已複製" : "複製"}</button></div>
          </div>
          <CommentDemo jobId={job._id} className="lg:col-span-2" />
        </div>
      )}
    </section>
  );
}

function CommentDemo({ jobId, className = "" }: { jobId: string; className?: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ text: string; reply: string; itemCode: string | null; itemTitle: string | null; model: string; ms: number }[]>([]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const r = await fetch("/api/comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, text }) });
    const j = await r.json();
    setLog((l) => [{ text, reply: j.reply ?? j.error, itemCode: j.itemCode ?? null, itemTitle: j.itemTitle ?? null, model: j.model ?? "", ms: j.ms ?? 0 }, ...l]);
    setText(""); setBusy(false);
  }
  return (
    <div className={`card p-4 ${className}`}>
      <h3 className="font-semibold">留言對商品</h3>
      <p className="text-xs text-stone-500">貼上顧客留言，例如「A3 多少」「還有藍色的嗎」。由開放權重的 Muse Spark Open（Baseten 託管）判斷意圖、對上商品、草擬回覆。</p>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} className="input" placeholder="顧客留言…" />
        <button disabled={busy} className="btn btn-primary whitespace-nowrap">{busy ? "…" : "送出"}</button>
      </form>
      <ul className="mt-3 space-y-2 text-sm">
        {log.map((l, i) => (
          <li key={i} className="rounded-lg bg-stone-50 p-2">
            <div className="text-stone-500">顧客：{l.text}</div>
            <div className="mt-0.5">小編：{l.reply} {l.itemCode && <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 font-mono text-xs text-orange-700">{l.itemCode} {l.itemTitle}</span>}</div>
            <div className="mt-0.5 text-[10px] text-stone-400">{l.model} · {l.ms} ms</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
