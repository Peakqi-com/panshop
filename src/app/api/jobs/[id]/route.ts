import { ObjectId } from "mongodb";
import { jobs } from "@/repositories/jobs";
import { items } from "@/repositories/items";
import { tracks } from "@/repositories/tracks";
import { assets } from "@/repositories/assets";

function serialize<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (x instanceof ObjectId ? String(x) : x)));
}

/** 進度頁與確認表輪詢用：job、items、tracks（框只回摘要）、assets */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = ObjectId.isValid(id) ? await jobs.byId(id) : await jobs.byCode(id);
  if (!job?._id) return Response.json({ error: "not found" }, { status: 404 });
  const url = new URL(req.url);
  const full = url.searchParams.get("full") === "1";
  const [its, trs, ass] = await Promise.all([items.forJob(job._id), full ? tracks.forJob(job._id) : [], full ? assets.forJob(job._id) : []]);
  return Response.json(serialize({
    job,
    items: its,
    tracks: trs.map((t) => ({ ...t, boxes: t.boxes.filter((_, i) => i % 2 === 0) })),
    assets: ass,
  }));
}
