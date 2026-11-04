import { jobs } from "@/repositories/jobs";
import { items as itemRepo } from "@/repositories/items";
import { assets as assetRepo } from "@/repositories/assets";
import { getT } from "@/lib/i18n-server";

const COLS = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "additional_image_link", "brand", "google_product_category", "color", "material"];
const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

/** Meta Commerce Manager 可直接上傳的商品目錄 CSV */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await jobs.byId(id);
  if (!job?._id) return new Response((await getT())("找不到這個掃描", "Scan not found"), { status: 404 });
  const [list, ass] = await Promise.all([itemRepo.forJob(job._id), assetRepo.forJob(job._id)]);
  const byItem = new Map(ass.map((a) => [String(a.itemId), a]));
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const rows = list.filter((i) => i.status === "confirmed").map((i) => {
    const a = byItem.get(String(i._id));
    const img = i.heroUrl ?? a?.studioUrl ?? a?.cutoutUrl ?? i.primaryCutoutUrl ?? "";
    const extra = (a?.shots ?? []).map((sh) => sh.url).filter((u) => u !== img).join(",");
    return [
      `${job.code}-${i.code}`, i.title, i.description || i.title, "in stock", "new",
      i.price != null ? `${i.price.toFixed(2)} ${i.currency}` : "", `${origin}/s/${job.code}#${i.code}`, img, extra,
      job.shopName || "PanShop", i.googleProductCategory, i.color, i.material,
    ].map(cell).join(",");
  });
  const csv = "\uFEFF" + [COLS.join(","), ...rows].join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="panshop-${job.code}.csv"` } });
}
