"use client";

import { useState } from "react";
import type { JobPayload, ItemRow } from "./job-view";

export function ReviewTable({ data, onChange }: { data: JobPayload; onChange: () => void }) {
  const { job, items } = data;
  const [busy, setBusy] = useState(false);
  const editable = job.status === "review";

  async function produce() {
    setBusy(true);
    await fetch(`/api/jobs/${job._id}/produce`, { method: "POST" });
    setBusy(false);
    onChange();
  }

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">確認表</h2>
        <p className="text-sm text-neutral-500">黃底是低信心，改一下再建目錄。</p>
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr><th className="p-2">圖</th><th className="p-2">代碼</th><th className="p-2">品名</th><th className="p-2">顏色／材質</th><th className="p-2">價格</th><th className="p-2">來源</th><th className="p-2"></th></tr>
          </thead>
          <tbody>
            {items.map((it) => <Row key={it._id} item={it} editable={editable} onChange={onChange} />)}
          </tbody>
        </table>
      </div>
      {editable && (
        <button onClick={produce} disabled={busy || !items.length} className="mt-4 rounded-lg bg-orange-600 px-5 py-3 font-medium text-white disabled:opacity-50">
          {busy ? "啟動中…" : `建立目錄（${items.length} 件）`}
        </button>
      )}
    </section>
  );
}

function Row({ item, editable, onChange }: { item: ItemRow; editable: boolean; onChange: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [price, setPrice] = useState(item.price == null ? "" : String(item.price));
  const low = item.confidence.overall < 0.6;

  async function save(patch: Record<string, unknown>) {
    await fetch(`/api/items/${item._id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    onChange();
  }
  async function remove() {
    await fetch(`/api/items/${item._id}`, { method: "DELETE" });
    onChange();
  }

  return (
    <tr className={`border-t ${low ? "bg-yellow-50" : ""}`}>
      <td className="p-2"><img src={item.primaryCutoutUrl ?? item.primaryCropUrls[0]} alt="" className="h-16 w-16 rounded object-cover" /></td>
      <td className="p-2 font-mono">{item.code}</td>
      <td className="p-2">
        {editable ? <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== item.title && save({ title })} className="w-56 rounded border px-2 py-1" /> : item.title}
        <div className="text-xs text-neutral-400">{item.category}・信心 {Math.round(item.confidence.overall * 100)}%</div>
      </td>
      <td className="p-2 text-neutral-600">{[item.color, item.material].filter(Boolean).join("／")}</td>
      <td className="p-2">
        {editable ? <input value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} onBlur={() => save({ price: price === "" ? null : Number(price) })} className="w-24 rounded border px-2 py-1" placeholder="未定" /> : item.price ?? "未定"}
      </td>
      <td className="p-2 text-xs text-neutral-500" title={item.speechEvidence}>{item.sources.speech ? "畫面＋口述" : "畫面"}</td>
      <td className="p-2">{editable && <button onClick={remove} className="text-xs text-neutral-400 hover:text-red-600">不賣</button>}</td>
    </tr>
  );
}
