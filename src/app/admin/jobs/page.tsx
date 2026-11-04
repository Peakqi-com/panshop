import { jobs } from "@/repositories/jobs";
import { fmtTime } from "@/lib/format";
import { JobsTable, type JobRow } from "./jobs-table";

const STATUS: Record<string, string> = { uploaded: "排隊中", processing: "分析中", review: "待確認", producing: "產出中", done: "完成", failed: "失敗" };

const PER = 50;

export default async function AdminJobs({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const filter = { status: sp.status, q: sp.q?.trim() || undefined };
  const [list, total] = await Promise.all([jobs.listFiltered({ ...filter, limit: PER, skip: (page - 1) * PER }), jobs.countFiltered(filter)]);
  const pages = Math.max(1, Math.ceil(total / PER));
  const href = (p: number) => `/admin/jobs?${new URLSearchParams({ ...(sp.status ? { status: sp.status } : {}), ...(sp.q ? { q: sp.q } : {}), page: String(p) })}`;
  const rows: JobRow[] = list.map((j) => ({
    id: String(j._id), code: j.code, shopName: j.shopName, status: j.status, source: j.source, createdAt: fmtTime(j.createdAt),
    durationSec: j.video.durationSec ?? null, itemCount: j.metrics.itemCount ?? null, costUsd: j.metrics.costUsd ?? null, style: j.style,
  }));
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
      <JobsTable rows={rows} />
      <div className="mt-3 flex items-center justify-between text-sm text-stone-500">
        <span>共 {total} 個，第 {page}／{pages} 頁</span>
        <div className="flex gap-2">{page > 1 && <a href={href(page - 1)} className="btn btn-ghost">上一頁</a>}{page < pages && <a href={href(page + 1)} className="btn btn-ghost">下一頁</a>}</div>
      </div>
    </div>
  );
}
