import Link from "next/link";
import { fmtTimeL, JOB_STATUS, makeT } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { UploadForm } from "@/components/upload-form";
import { jobs } from "@/repositories/jobs";
import { myJobs } from "@/lib/owner";
import { settings } from "@/repositories/settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [recent, cfg, lang] = await Promise.all([myJobs(6).catch(() => []), settings.get(), getLang()]);
  const t = makeT(lang);
  const featured = cfg.featuredJobCode ? await jobs.byCode(cfg.featuredJobCode).catch(() => null) : null;
  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-12">
      {cfg.announcement && <p className="mb-6 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm text-orange-900">{cfg.announcement}</p>}
      <section className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div className="rise">
          <p className="text-sm font-medium text-orange-600">{t("PanShop · 掃一圈，就開賣", "PanShop · Pan once, start selling")}</p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl">
            {lang === "en" ? <>Pan your phone across your products.<br />Your shop is ready.</> : <>對著商品慢慢掃一圈，<br />你的店就開好了。</>}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
            {t("直播、團購賣家的開播前後台。掃一段影片、丟一疊照片，或上傳直播回放，PanShop 會切出每一件商品、編好下單代碼、寫好品名與描述、做出多角度商品圖，匯出 Meta 商品目錄、可購買頁和每件一支短片；觀眾留言「A3+1」，直接整理成訂單表。",
              "The before-and-after-the-show back office for live and group-buy sellers. Shoot one video, drop in photos, or upload a live replay: PanShop cuts out every product, gives it an order code, writes the title and description, makes multi-angle photos, and exports a Meta catalog, a shop page and a short video per item. When shoppers comment “A3+1”, it becomes an order sheet.")}
          </p>
          <ol className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
            {[
              ["1", t("掃或匯入", "Scan or import"), t("影片、照片、直播回放三種入口，怎麼方便怎麼來。", "Video, photos or a live replay: use whatever you have.")],
              ["2", t("確認", "Review"), t("一張表：改價格、刪不賣的，就好。", "One table: fix prices, drop what you won't sell.")],
              ["3", t("開賣", "Sell"), t("目錄 CSV、可購買頁、短影片一次拿到。", "Catalog CSV, shop page and short videos in one go.")],
            ].map(([n, t, d]) => (
              <li key={n} className="card p-4">
                <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-stone-900 text-xs text-white">{n}</span><span className="font-semibold">{t}</span></div>
                <p className="mt-2 text-stone-600">{d}</p>
              </li>
            ))}
          </ol>
        </div>
        <UploadForm needPasscode={!!process.env.UPLOAD_PASSCODE} trialPerDay={cfg.trialJobsPerIp} sampleAvailable={!!(cfg.sampleVideoUrl || process.env.SAMPLE_VIDEO_URL)} maxVideoSec={cfg.maxVideoSec} maxReplaySec={cfg.maxReplaySec} maxUploadMb={cfg.maxUploadMb} maxPhotos={cfg.maxPhotos} />
      </section>

      {featured && (
        <section className="mt-16">
          <h2 className="text-lg font-semibold">{t("看一個完成的範例", "See a finished example")}</h2>
          <p className="mt-1 text-sm text-stone-500">{lang === "en" ? `A ${Math.round(featured.video.durationSec ?? 0)}-second video became ${featured.metrics.itemCount ?? 0} products with photos, a Meta catalog, a shop page and a short video for each.` : `一段 ${Math.round(featured.video.durationSec ?? 0)} 秒的影片，切出 ${featured.metrics.itemCount ?? 0} 件商品，做好商品圖、Meta 目錄、可購買頁與每件一支短片。`}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={`/jobs/${featured.code}`} className="btn btn-primary">{t("看產出", "View outputs")}</Link>
            <Link href={`/s/${featured.code}`} className="btn btn-ghost">{t("看可購買頁", "View shop page")}</Link>
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section className="mt-16">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">{t("你最近的掃描", "Your recent scans")}</h2>
            <Link href="/jobs" className="text-sm text-stone-500 hover:text-stone-900">{t("全部", "All")}</Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((j) => (
              <Link key={String(j._id)} href={`/jobs/${j.code}`} className="card flex gap-3 p-3 transition hover:shadow-md">
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                  {j.frames[0] && <img src={j.frames[0].url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{j.shopName || t("未命名", "Untitled")}</div>
                  <div className="text-xs text-stone-500">{JOB_STATUS[j.status] ? t(...JOB_STATUS[j.status]) : j.status}{j.metrics.itemCount != null ? ` · ${j.metrics.itemCount}${t(" 件", " items")}` : ""}</div>
                  <div className="text-xs text-stone-400">{fmtTimeL(j.createdAt, lang)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

