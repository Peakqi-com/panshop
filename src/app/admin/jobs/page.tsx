import Link from "next/link";
import { jobs } from "@/repositories/jobs";

const STATUS: Record<string, string> = { uploaded: "排隊中", processing: "分析中", review: "待確認", producing: "產出中", done: "完成", failed: "失敗" };

export default async function AdminJobs({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const list = await jobs.listFiltered({ status: sp.status, q: sp.q?.trim() || undefined, limit: 200 });
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">掃描工作</h1>
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <select name="status" defaultValue={sp.status ?? ""} className="input w-32">
            <option value="">全部狀態</option>
            {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="代碼或店名" className="input w-40" />
          <button className="btn btn-ghost whitespace-nowrap">篩選</button>
        </form>
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500"><tr><th className="p-3">時間</th><th className="p-3">店名／代碼</th><th className="p-3">狀態</th><th className="p-3 text-right">影片</th><th className="p-3 text-right">件數</th><th className="p-3 text-right">成本</th><th className="p-3">風格</th><th className="p-3"></th></tr></thead>
          <tbody>
            {list.map((j) => (
              <tr key={String(j._id)} className="border-t border-stone-100">
                <td className="p-3 text-xs text-stone-500">{j.createdAt.toLocaleString("zh-TW", { hour12: false })}</td>
                <td className="p-3"><Link href={`/admin/jobs/${String(j._id)}`} className="font-medium hover:underline">{j.shopName || "未命名"}</Link> <span className="font-mono text-xs text-stone-400">{j.code}</span></td>
                <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${j.status === "done" ? "bg-green-100 text-green-800" : j.status === "failed" ? "bg-red-100 text-red-700" : j.status === "review" ? "bg-orange-100 text-orange-800" : "bg-stone-100 text-stone-600"}`}>{STATUS[j.status] ?? j.status}</span></td>
                <td className="p-3 text-right">{j.video.durationSec ? `${Math.round(j.video.durationSec)}s` : "—"}</td>
                <td className="p-3 text-right">{j.metrics.itemCount ?? "—"}</td>
                <td className="p-3 text-right">{j.metrics.costUsd != null ? `$${j.metrics.costUsd.toFixed(2)}` : "—"}</td>
                <td className="p-3 text-xs text-stone-500">{j.style}</td>
                <td className="p-3 text-right text-xs"><Link href={`/jobs/${j.code}`} target="_blank" className="text-stone-500 hover:underline">前台</Link></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-sm text-stone-500">沒有符合的工作</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
