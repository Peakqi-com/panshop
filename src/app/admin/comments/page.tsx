import Link from "next/link";
import { fmtTime } from "@/lib/format";
import { getDb } from "@/lib/db";
import type { Comment } from "@/models/comment";
import { jobs } from "@/repositories/jobs";

export default async function AdminComments() {
  const db = await getDb();
  const list = await db.collection<Comment>("comments").find({}).sort({ _id: -1 }).limit(100).toArray();
  const jobIds = Array.from(new Set(list.map((c) => String(c.jobId))));
  const jobMap = new Map((await Promise.all(jobIds.map((id) => jobs.byId(id)))).filter(Boolean).map((j) => [String(j!._id), j!]));
  return (
    <div>
      <h1 className="text-2xl font-bold">留言紀錄</h1>
      <p className="mt-1 text-sm text-stone-500">可購買頁與產出頁的留言示範，含模型與延遲。</p>
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
    </div>
  );
}
