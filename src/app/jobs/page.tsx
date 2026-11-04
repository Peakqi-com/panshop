import Link from "next/link";
import { fmtTime } from "@/lib/format";
import { myJobs } from "@/lib/owner";

export const dynamic = "force-dynamic";
const STATUS: Record<string, string> = { uploaded: "排隊中", processing: "分析中", review: "待確認", producing: "產出中", done: "完成", failed: "失敗" };

export default async function JobsPage() {
  const list = await myJobs(50);
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">我的掃描</h1>
      <p className="mt-1 text-sm text-stone-500">在這個瀏覽器建立的掃描。沒有帳號系統，換瀏覽器或清除 Cookie 就看不到了，請保留掃描網址。</p>
      <div className="card mt-6 divide-y divide-stone-100">
        {list.length === 0 && <p className="p-6 text-sm text-stone-500">還沒有掃描。<Link href="/" className="underline">上傳第一段影片</Link></p>}
        {list.map((j) => (
          <Link key={String(j._id)} href={`/jobs/${j.code}`} className="flex items-center gap-4 p-3 hover:bg-stone-50">
            <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-stone-100">{j.frames[0] && <img src={j.frames[0].url} alt="" className="h-full w-full object-cover" />}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{j.shopName || "未命名"} <span className="ml-1 font-mono text-xs text-stone-400">{j.code}</span></div>
              <div className="text-xs text-stone-500">{fmtTime(j.createdAt)}{j.video.durationSec ? ` · ${Math.round(j.video.durationSec)} 秒` : ""}{j.metrics.itemCount != null ? ` · ${j.metrics.itemCount} 件` : ""}</div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs ${j.status === "done" ? "bg-green-100 text-green-800" : j.status === "failed" ? "bg-red-100 text-red-700" : j.status === "review" ? "bg-orange-100 text-orange-800" : "bg-stone-100 text-stone-600"}`}>{STATUS[j.status] ?? j.status}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
