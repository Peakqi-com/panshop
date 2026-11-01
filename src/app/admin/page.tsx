import Link from "next/link";
import { jobs } from "@/repositories/jobs";

const STATUS: Record<string, string> = { uploaded: "排隊中", processing: "分析中", review: "待確認", producing: "產出中", done: "完成", failed: "失敗" };

export default async function AdminHome() {
  const s = await jobs.stats();
  const maxCost = Math.max(0.01, ...s.byDay.map((d) => d.cost));
  return (
    <div>
      <h1 className="text-2xl font-bold">總覽</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="掃描總數" value={String(s.totals.jobs)} />
        <Tile label="商品總數" value={String(s.totals.items)} />
        <Tile label="影片總長" value={`${Math.round(s.totals.seconds / 60)} 分`} />
        <Tile label="API 總成本" value={`$${s.totals.cost.toFixed(2)}`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="font-semibold">狀態分布</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {Object.entries(STATUS).map(([k, l]) => (
              <li key={k} className="flex items-center justify-between"><span>{l}</span><Link href={`/admin/jobs?status=${k}`} className="font-mono text-stone-600 hover:underline">{s.byStatus[k] ?? 0}</Link></li>
            ))}
          </ul>
        </section>
        <section className="card p-4">
          <h2 className="font-semibold">近 14 天成本</h2>
          {s.byDay.length === 0 ? <p className="mt-3 text-sm text-stone-500">還沒有資料</p> : (
            <div className="mt-3 flex h-32 items-end gap-1">
              {s.byDay.map((d) => (
                <div key={d._id} className="flex flex-1 flex-col items-center gap-1" title={`${d._id}：${d.jobs} 件，$${d.cost.toFixed(2)}`}>
                  <div className="w-full rounded-t bg-orange-400" style={{ height: `${Math.max(4, (d.cost / maxCost) * 100)}%` }} />
                  <span className="text-[10px] text-stone-400">{d._id.slice(3)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="card mt-4 p-4">
        <h2 className="font-semibold">最近失敗</h2>
        {s.failures.length === 0 ? <p className="mt-2 text-sm text-stone-500">沒有失敗的工作</p> : (
          <ul className="mt-2 divide-y divide-stone-100 text-sm">
            {s.failures.map((j) => {
              const st = Object.entries(j.stages).find(([, v]) => v.status === "failed");
              return (
                <li key={String(j._id)} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/admin/jobs/${String(j._id)}`} className="font-medium hover:underline">{j.shopName || "未命名"} <span className="font-mono text-xs text-stone-400">{j.code}</span></Link>
                    <div className="truncate text-xs text-red-700">{st ? `${st[0]}：${st[1].error}` : ""}</div>
                  </div>
                  <span className="shrink-0 text-xs text-stone-400">{j.createdAt.toLocaleString("zh-TW", { hour12: false })}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return <div className="card p-4"><div className="text-xs text-stone-500">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>;
}
