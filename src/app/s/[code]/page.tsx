import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { assets as assetRepo } from "@/repositories/assets";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const job = await jobs.byCode(code);
  return { title: job?.shopName || "本週新品" };
}

/** 可購買頁：公開、手機優先。第一階段購買按鈕是留言範本（第二階段接 IG／WhatsApp） */
export default async function ShopPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const job = await jobs.byCode(code);
  if (!job?._id) notFound();
  const [list, ass] = await Promise.all([itemRepo.forJob(job._id), assetRepo.forJob(job._id)]);
  const byItem = new Map(ass.map((a) => [String(a.itemId), a]));
  const visible = list.filter((i) => i.status !== "deleted");
  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8">
      <header className="text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-gradient-to-br from-orange-500 to-amber-400" />
        <h1 className="mt-3 text-2xl font-bold">{job.shopName || "本週新品"}</h1>
        <p className="mt-1 text-sm text-stone-500">{visible.length} 件 · 留言商品代碼即可下單</p>
      </header>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {visible.map((it) => {
          const a = byItem.get(String(it._id));
          const img = a?.studioUrl ?? a?.cutoutUrl ?? it.primaryCutoutUrl ?? it.primaryCropUrls[0];
          return (
            <article key={String(it._id)} id={it.code} className="card overflow-hidden">
              <div className="aspect-square bg-white">{img && <img src={img} alt={it.title} className="h-full w-full object-contain" />}</div>
              <div className="p-2.5">
                <div className="font-mono text-[11px] text-stone-400">{it.code}</div>
                <h2 className="text-sm font-medium leading-tight">{it.title}</h2>
                <div className="mt-1 text-sm font-semibold">{it.price != null ? `${it.currency} ${it.price.toLocaleString()}` : "私訊詢價"}</div>
                <a href={`sms:?body=${encodeURIComponent(`我要 ${it.code} ${it.title}`)}`} className="btn btn-primary mt-2 w-full py-1.5 text-xs">我要這個</a>
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-10 text-center text-xs text-stone-400">Built with PanShop</p>
    </main>
  );
}
