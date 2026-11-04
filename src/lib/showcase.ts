import { jobs } from "@/repositories/jobs";
import { items } from "@/repositories/items";
import { assets } from "@/repositories/assets";

/** 首頁展示用：正式站已跑完的真實掃描。/admin 設了 featuredJobCode 就用它，否則用下面的預設掃描。 */
export const SHOWCASE_DEFAULT = { zh: "2edauk4btx", en: "r8vfcdf3um" } as const;

export type ShowItem = {
  code: string;
  title: string;
  price: number | null;
  cutout?: string;
  crop?: string;
  shots: { kind: string; url: string }[];
  reel?: string;
  cover?: string;
  speech: string;
};
export type Showcase = { code: string; currency: string; items: ShowItem[] };

export async function loadShowcase(code: string | undefined | null): Promise<Showcase | null> {
  if (!code) return null;
  try {
    const job = await jobs.byCode(code);
    if (!job?._id || job.status !== "done") return null;
    const [list, ass] = await Promise.all([items.forJob(job._id), assets.forJob(job._id)]);
    const byItem = new Map(ass.map((a) => [String(a.itemId), a]));
    const out = list
      .filter((i) => i.status !== "deleted")
      .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }))
      .slice(0, 6)
      .map((i) => {
        const a = byItem.get(String(i._id));
        return {
          code: i.code,
          title: i.title,
          price: i.price,
          cutout: i.primaryCutoutUrl,
          crop: i.primaryCropUrls[0],
          shots: (a?.shots ?? []).map((s) => ({ kind: s.kind, url: s.url })),
          reel: a?.reelUrl,
          cover: a?.coverUrl,
          speech: i.speechEvidence,
        };
      });
    return out.length ? { code: job.code, currency: job.currency ?? "TWD", items: out } : null;
  } catch {
    return null;
  }
}
