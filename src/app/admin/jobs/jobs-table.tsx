"use client";

import Link from "next/link";
import { useState } from "react";
import { BulkDelete } from "../forms";

export type JobRow = { id: string; code: string; shopName: string; status: string; createdAt: string; durationSec: number | null; itemCount: number | null; costUsd: number | null; style: string };
const STATUS: Record<string, string> = { uploaded: "排隊中", processing: "分析中", review: "待確認", producing: "產出中", done: "完成", failed: "失敗" };

export function JobsTable({ rows }: { rows: JobRow[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allFailed = rows.filter((r) => r.status === "failed").map((r) => r.id);
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={() => setSel(new Set(rows.map((r) => r.id)))} className="text-stone-500 hover:underline">全選</button>
          <button type="button" onClick={() => setSel(new Set(allFailed))} className="text-stone-500 hover:underline">選全部失敗（{allFailed.length}）</button>
          <button type="button" onClick={() => setSel(new Set())} className="text-stone-500 hover:underline">清除</button>
        </div>
        <BulkDelete ids={Array.from(sel)} />
      </div>
      <div className="card mt-2 overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500"><tr><th className="p-3"></th><th className="p-3">時間</th><th className="p-3">店名／代碼</th><th className="p-3">狀態</th><th className="p-3 text-right">影片</th><th className="p-3 text-right">件數</th><th className="p-3 text-right">成本</th><th className="p-3">風格</th><th className="p-3"></th></tr></thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id} className={`border-t border-stone-100 ${sel.has(j.id) ? "bg-red-50/60" : ""}`}>
                <td className="p-3"><input type="checkbox" checked={sel.has(j.id)} onChange={() => toggle(j.id)} /></td>
                <td className="p-3 text-xs text-stone-500">{new Date(j.createdAt).toLocaleString("zh-TW", { hour12: false })}</td>
                <td className="p-3"><Link href={`/admin/jobs/${j.id}`} className="font-medium hover:underline">{j.shopName || "未命名"}</Link> <span className="font-mono text-xs text-stone-400">{j.code}</span></td>
                <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${j.status === "done" ? "bg-green-100 text-green-800" : j.status === "failed" ? "bg-red-100 text-red-700" : j.status === "review" ? "bg-orange-100 text-orange-800" : "bg-stone-100 text-stone-600"}`}>{STATUS[j.status] ?? j.status}</span></td>
                <td className="p-3 text-right">{j.durationSec ? `${Math.round(j.durationSec)}s` : "—"}</td>
                <td className="p-3 text-right">{j.itemCount ?? "—"}</td>
                <td className="p-3 text-right">{j.costUsd != null ? `$${j.costUsd.toFixed(2)}` : "—"}</td>
                <td className="p-3 text-xs text-stone-500">{j.style}</td>
                <td className="p-3 text-right text-xs"><Link href={`/jobs/${j.code}`} target="_blank" className="text-stone-500 hover:underline">前台</Link></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-sm text-stone-500">沒有符合的工作</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
