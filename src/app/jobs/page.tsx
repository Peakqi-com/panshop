import Link from "next/link";
import { fmtTimeL, JOB_STATUS } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { makeT } from "@/lib/i18n";
import { myJobs } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const [list, lang] = await Promise.all([myJobs(50), getLang()]);
  const t = makeT(lang);
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("我的掃描", "My scans")}</h1>
      <p className="mt-1 text-sm text-stone-500">{t("在這個瀏覽器建立的掃描。沒有帳號系統，換瀏覽器或清除 Cookie 就看不到了，請保留掃描網址。", "Scans created in this browser. There are no accounts: switching browsers or clearing cookies hides them, so keep each scan’s link.")}</p>
      <div className="card mt-6 divide-y divide-stone-100">
        {list.length === 0 && <p className="p-6 text-sm text-stone-500">{t("還沒有掃描。", "No scans yet. ")}<Link href="/new" className="underline">{t("上傳第一段影片", "Upload your first video")}</Link></p>}
        {list.map((j) => (
          <Link key={String(j._id)} href={`/jobs/${j.code}`} className="flex items-center gap-4 p-3 hover:bg-stone-50">
            <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-stone-100">{j.frames[0] && <img src={j.frames[0].url} alt="" className="h-full w-full object-cover" />}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{j.shopName || t("未命名", "Untitled")} <span className="ml-1 font-mono text-xs text-stone-400">{j.code}</span></div>
              <div className="text-xs text-stone-500">{fmtTimeL(j.createdAt, lang)}{j.video.durationSec ? ` · ${Math.round(j.video.durationSec)}${t(" 秒", "s")}` : ""}{j.metrics.itemCount != null ? ` · ${j.metrics.itemCount}${t(" 件", " items")}` : ""}</div>
            </div>
            <span className={`rounded-full border-2 border-[var(--ink)] px-2.5 py-1 text-xs font-bold ${j.status === "done" ? "bg-[var(--teal)]" : j.status === "failed" ? "bg-[var(--pink)]" : j.status === "review" ? "bg-[var(--yellow)]" : "bg-white"}`}>{JOB_STATUS[j.status] ? t(...JOB_STATUS[j.status]) : j.status}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
