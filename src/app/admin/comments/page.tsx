import Link from "next/link";
import { fmtTime } from "@/lib/format";
import { getDb } from "@/lib/db";
import type { Comment } from "@/models/comment";
import { jobs } from "@/repositories/jobs";

const PER = 100;

export default async function AdminComments({ searchParams }: { searchParams: Promise<{ job?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const db = await getDb();
  const only = sp.job?.trim() ? await jobs.byCode(sp.job.trim()) : null;
  const filter = only?._id ? { jobId: only._id } : {};
  const [list, total] = await Promise.all([db.collection<Comment>("comments").find(filter).sort({ _id: -1 }).skip((page - 1) * PER).limit(PER).toArray(), db.collection<Comment>("comments").countDocuments(filter)]);
  const pages = Math.max(1, Math.ceil(total / PER));
  const href = (p: number) => `/admin/comments?${new URLSearchParams({ ...(sp.job ? { job: sp.job } : {}), page: String(p) })}`;
  const jobIds = Array.from(new Set(list.map((c) => String(c.jobId))));
  const jobMap = new Map((await Promise.all(jobIds.map((id) => jobs.byId(id)))).filter(Boolean).map((j) => [String(j!._id), j!]));
  return (
    <div>
      <h1 className="text-2xl font-bold">留言紀錄</h1>
      <p className="mt-1 text-sm text-stone-500">可購買頁與產出頁的留言示範，含模型與延遲。</p>
      <form className="mt-3 flex gap-2 text-sm"><input name="job" defaultValue={sp.job ?? ""} placeholder="掃描代碼" className="input w-48 font-mono" /><button className="btn btn-ghost">篩選</button>{sp.job && <a href="/admin/comments" className="btn btn-ghost">清除</a>}</form>
      {sp.job && !only && <p className="mt-2 text-sm text-red-600">找不到這個掃描代碼。</p>}
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500"><tr><th className="p-2">時間</th><th className="p-2">工作</th><th className="p-2">留言</th><th className="p-2">意圖</th><th className="p-2">商品</th><th className="p-2">回覆</th><th className="p-2">模型</th></tr></thead>
          <tbody>
            {list.map((c) => { const j = jobMap.get(String(c.jobId)); return (
              <tr key={String(c._id)} className="border-t border-stone-100 align-top">
                <td className="p-2 text-xs text-stone-500">{fmtTime(c.createdAt)}</td>
                <td className="p-2 text-xs">{j ? <Link href={`/admin/jobs/${String(j._id)}`} className="hover:underline">{j.shopName || j.code}</Link> : "—"}</td>
                <td className="p-2">{c.text}</td>
                <td className="p-2 text-xs">{c.intent}</td>
                <td className="p-2 font-mono text-xs">{c.itemCode ?? "—"}</td>
                <td className="p-2 text-xs text-stone-600">{c.reply}</td>
                <td className="p-2 text-xs text-stone-500">{c.model}{c.ms ? ` · ${c.ms} ms` : ""}</td>
              </tr>
            ); })}
            {list.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-sm text-stone-500">還沒有留言</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-stone-500">
        <span>共 {total} 則，第 {page}／{pages} 頁</span>
        <div className="flex gap-2">{page > 1 && <a href={href(page - 1)} className="btn btn-ghost">上一頁</a>}{page < pages && <a href={href(page + 1)} className="btn btn-ghost">下一頁</a>}</div>
      </div>
    </div>
  );
}
