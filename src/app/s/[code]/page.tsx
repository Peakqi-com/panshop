import { notFound } from "next/navigation";
import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { assets as assetRepo } from "@/repositories/assets";

export const dynamic = "force-dynamic";

/** 可購買頁：公開、手機優先。第一階段購買按鈕是留言範本（第二階段接 IG／WhatsApp） */
export default async function ShopPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const job = await jobs.byCode(code);
  if (!job?._id) notFound();
  const [list, ass] = await Promise.all([itemRepo.forJob(job._id), assetRepo.forJob(job._id)]);
  const byItem = new Map(ass.map((a) => [String(a.itemId), a]));
  const visible = list.filter((i) => i.status !== "deleted");
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-2xl font-semibold">{job.shopName || "本週新品"}</h1>
      <p className="mt-1 text-sm text-neutral-500">{visible.length} 件・留言商品代碼即可下單</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {visible.map((it) => {
          const a = byItem.get(String(it._id));
          const img = a?.studioUrl ?? a?.cutoutUrl ?? it.primaryCutoutUrl ?? it.primaryCropUrls[0];
          return (
            <article key={String(it._id)} className="overflow-hidden rounded-lg border bg-white">
              {img && <img src={img} alt={it.title} className="aspect-square w-full object-cover" />}
              <div className="p-2">
                <div className="text-xs text-neutral-400">{it.code}</div>
                <h2 className="text-sm font-medium leading-tight">{it.title}</h2>
                <div className="mt-1 text-sm font-semibold">{it.price != null ? `${it.currency} ${it.price.toLocaleString()}` : "私訊詢價"}</div>
                <a href={`sms:?body=${encodeURIComponent(`我要 ${it.code} ${it.title}`)}`} className="mt-2 block rounded bg-black py-1.5 text-center text-xs text-white">我要這個</a>
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-8 text-center text-xs text-neutral-400">Built with PanShop</p>
    </main>
  );
}
