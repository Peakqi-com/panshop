import { notFound } from "next/navigation";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { assets as assetRepo } from "@/repositories/assets";
import { ShopGrid, type ShopItem } from "@/components/shop-grid";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const job = await jobs.byCode(code);
  return { title: job?.shopName || "本週新品", description: job ? `${job.metrics.itemCount ?? ""} 件商品，留言代碼即可下單` : undefined };
}

/** 可購買頁：公開、手機優先。下單＝複製「我要 代碼 品名」，再帶顧客去賣家的 IG、LINE 或簡訊 */
export default async function ShopPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const job = await jobs.byCode(code);
  if (!job?._id) notFound();
  const [list, ass] = await Promise.all([itemRepo.forJob(job._id), assetRepo.forJob(job._id)]);
  const byItem = new Map(ass.map((a) => [String(a.itemId), a]));
  const shopUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/s/${job.code}`;
  const qr = await QRCode.toDataURL(shopUrl, { width: 360, margin: 1, color: { dark: "#1c1917", light: "#ffffff" } });
  const items: ShopItem[] = list.filter((i) => i.status !== "deleted").map((it) => {
    const a = byItem.get(String(it._id));
    const shots = (a?.shots ?? []).map((s) => ({ kind: s.kind, label: s.label, url: s.url }));
    const hero = it.heroUrl ?? shots.find((s) => s.kind === "threeQuarter")?.url ?? shots[0]?.url ?? a?.studioUrl ?? a?.cutoutUrl ?? it.primaryCutoutUrl ?? null;
    return { id: String(it._id), code: it.code, title: it.title, price: it.price, currency: it.currency, category: it.category, description: it.description, color: it.color, material: it.material, hero, shots, reelUrl: a?.reelUrl ?? null, caption: a?.caption ?? "" };
  });
  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8">
      <header className="text-center">
        <div aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-orange-500 to-amber-400 text-2xl font-bold text-white">{Array.from(job.shopName || "新")[0]}</div>
        <h1 className="mt-3 text-2xl font-bold">{job.shopName || "本週新品"}</h1>
        <p className="mt-1 text-sm text-stone-500">{items.length} 件 · 點商品看詳情，留言代碼即可下單</p>
      </header>
      <ShopGrid items={items} shopName={job.shopName || "本週新品"} shopUrl={shopUrl} qrDataUrl={qr} contact={{ instagram: job.contact?.instagram ?? "", line: job.contact?.line ?? "", phone: job.contact?.phone ?? "" }} />
      <p className="mt-10 text-center text-xs text-stone-400">Built with PanShop</p>
    </main>
  );
}
