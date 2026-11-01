import Link from "next/link";
import { fmtTime } from "@/lib/format";
import { UploadForm } from "@/components/upload-form";
import { jobs } from "@/repositories/jobs";
import { settings } from "@/repositories/settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [recent, cfg] = await Promise.all([jobs.list(6).catch(() => []), settings.get()]);
  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-12">
      {cfg.announcement && <p className="mb-6 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm text-orange-900">{cfg.announcement}</p>}
      <section className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div className="rise">
          <p className="text-sm font-medium text-orange-600">PanShop · 掃一圈，就開賣</p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl">
            對著商品慢慢掃一圈，<br />你的店就開好了。
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
            拍一段一到三分鐘的影片，邊拍邊說品名和價格。PanShop 會切出每一件商品、寫好品名與描述、做出商品圖，
            匯出 Meta 商品目錄、可購買頁，還有每件一支直式短影片。
          </p>
          <ol className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
            {[
              ["1", "掃", "手機繞著桌上的商品慢慢移動，每件停留三秒。"],
              ["2", "確認", "一張表：改價格、刪不賣的，就好。"],
              ["3", "開賣", "目錄 CSV、可購買頁、短影片一次拿到。"],
            ].map(([n, t, d]) => (
              <li key={n} className="card p-4">
                <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-stone-900 text-xs text-white">{n}</span><span className="font-semibold">{t}</span></div>
                <p className="mt-2 text-stone-600">{d}</p>
              </li>
            ))}
          </ol>
        </div>
        <UploadForm needPasscode={!!process.env.UPLOAD_PASSCODE} sampleAvailable={!!(cfg.sampleVideoUrl || process.env.SAMPLE_VIDEO_URL)} maxVideoSec={cfg.maxVideoSec} maxUploadMb={cfg.maxUploadMb} />
      </section>

      {recent.length > 0 && (
        <section className="mt-16">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">最近的掃描</h2>
            <Link href="/jobs" className="text-sm text-stone-500 hover:text-stone-900">全部</Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((j) => (
              <Link key={String(j._id)} href={`/jobs/${j.code}`} className="card flex gap-3 p-3 transition hover:shadow-md">
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                  {j.frames[0] && <img src={j.frames[0].url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{j.shopName || "未命名"}</div>
                  <div className="text-xs text-stone-500">{STATUS[j.status] ?? j.status}{j.metrics.itemCount != null ? ` · ${j.metrics.itemCount} 件` : ""}</div>
                  <div className="text-xs text-stone-400">{fmtTime(j.createdAt)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

const STATUS: Record<string, string> = { uploaded: "排隊中", processing: "分析中", review: "待確認", producing: "產出中", done: "完成", failed: "失敗" };
