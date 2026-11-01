"use client";

import { useState } from "react";
import type { JobPayload, ItemRow } from "./job-view";

export function ReviewTable({ data, onChange }: { data: JobPayload; onChange: () => void }) {
  const { job, items } = data;
  const [busy, setBusy] = useState(false);
  const editable = job.status === "review";
  const low = items.filter((i) => i.confidence.overall < 0.6).length;
  const noPrice = items.filter((i) => i.price == null).length;

  async function produce() {
    setBusy(true);
    await fetch(`/api/jobs/${job._id}/produce`, { method: "POST" });
    setBusy(false);
    onChange();
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">確認表</h2>
        <p className="text-sm text-stone-500">
          {editable ? <>只要確認一次。{low > 0 && <span className="text-amber-700">{low} 件信心較低（黃底）</span>}{low > 0 && noPrice > 0 && "，"}{noPrice > 0 && <span>{noPrice} 件沒有價格</span>}</> : "已確認"}
        </p>
      </div>
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500">
            <tr><th className="p-3">商品</th><th className="p-3">品名與描述</th><th className="p-3">顏色／材質</th><th className="p-3 text-right">價格（{job.currency}）</th><th className="p-3">依據</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {items.map((it) => <Row key={it._id} item={it} editable={editable} onChange={onChange} />)}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="sticky bottom-4 mt-4 flex items-center justify-between gap-3 rounded-xl bg-stone-900 p-3 text-white shadow-lg">
          <div className="text-sm"><span className="font-medium">{items.length} 件</span><span className="text-stone-400"> 將建立目錄、可購買頁與短影片</span></div>
          <button onClick={produce} disabled={busy || !items.length} className="btn btn-primary">{busy ? "啟動中…" : "建立目錄"}</button>
        </div>
      )}
    </section>
  );
}

function Row({ item, editable, onChange }: { item: ItemRow; editable: boolean; onChange: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [price, setPrice] = useState(item.price == null ? "" : String(item.price));
  const [desc, setDesc] = useState(item.description);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const low = item.confidence.overall < 0.6;

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    await fetch(`/api/items/${item._id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    setSaving(false);
    onChange();
  }
  async function remove() {
    await fetch(`/api/items/${item._id}`, { method: "DELETE" });
    onChange();
  }

  return (
    <tr className={`border-t border-stone-100 align-top ${low ? "bg-amber-50/70" : ""}`}>
      <td className="p-3">
        <div className="flex gap-2">
          <img src={item.primaryCutoutUrl ?? item.primaryCropUrls[0]} alt="" className="h-16 w-16 rounded-lg bg-white object-contain ring-1 ring-stone-200" />
          <div className="flex flex-col gap-1">{item.primaryCropUrls.slice(0, 2).map((u) => <img key={u} src={u} alt="" className="h-7 w-7 rounded object-cover ring-1 ring-stone-200" />)}</div>
        </div>
        <div className="mt-1 font-mono text-xs text-stone-500">{item.code} · {item.category}</div>
      </td>
      <td className="p-3">
        {editable ? (
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== item.title && save({ title })} className="input" />
        ) : <div className="font-medium">{item.title}</div>}
        {editable ? (
          <>
            <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-xs text-stone-500 hover:text-stone-900">{open ? "收起描述" : "描述"} {item.description && !open && <span className="text-stone-400">· {item.description.slice(0, 24)}…</span>}</button>
            {open && <textarea value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== item.description && save({ description: desc })} rows={3} className="input mt-1 text-xs" />}
          </>
        ) : <div className="mt-1 line-clamp-2 text-xs text-stone-500">{item.description}</div>}
        <div className="mt-1 text-[11px] text-stone-400">信心 {Math.round(item.confidence.overall * 100)}%{saving && " · 儲存中…"}</div>
      </td>
      <td className="p-3 text-stone-600">{[item.color, item.material].filter(Boolean).join("／") || "—"}</td>
      <td className="p-3 text-right">
        {editable ? (
          <input value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} onBlur={() => (price === "" ? null : Number(price)) !== item.price && save({ price: price === "" ? null : Number(price) })} className="input w-24 text-right" placeholder="未定" />
        ) : item.price != null ? item.price.toLocaleString() : <span className="text-stone-400">未定</span>}
      </td>
      <td className="p-3 text-xs text-stone-500">
        {item.sources.speech ? <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-800" title={item.speechEvidence}>畫面＋口述</span> : <span className="rounded bg-stone-100 px-1.5 py-0.5">畫面</span>}
        {item.speechEvidence && <div className="mt-1 max-w-[160px] truncate text-[11px] text-stone-400" title={item.speechEvidence}>「{item.speechEvidence}」</div>}
      </td>
      <td className="p-3 text-right">{editable && <button onClick={remove} className="text-xs text-stone-400 hover:text-red-600">不賣</button>}</td>
    </tr>
  );
}
