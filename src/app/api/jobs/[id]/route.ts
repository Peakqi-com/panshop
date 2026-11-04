import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { jobs } from "@/repositories/jobs";
import { items } from "@/repositories/items";
import { tracks } from "@/repositories/tracks";
import { assets } from "@/repositories/assets";
import { z } from "zod";
import { isAdmin } from "@/lib/auth";
import { canEditJob, guardJob } from "@/lib/owner";
import { apiError } from "@/lib/api-error";

function serialize<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (x instanceof ObjectId ? String(x) : x)));
}

/** 進度頁與確認表輪詢用：job、items、tracks（框只回摘要）、assets */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = ObjectId.isValid(id) ? await jobs.byId(id) : await jobs.byCode(id);
  if (!job?._id) return apiError("找不到", "Not found", 404);
  const url = new URL(req.url);
  const full = url.searchParams.get("full") === "1";
  const [its, trs, ass] = await Promise.all([items.forJob(job._id, { includeDeleted: full }), full ? tracks.forJob(job._id) : [], full ? assets.forJob(job._id) : []]);
  const { editTokenHash: _hash, ...publicJob } = job;
  void _hash;
  const admin = await isAdmin();
  return Response.json(serialize({
    job: admin ? publicJob : { ...publicJob, metrics: { ...publicJob.metrics, costUsd: undefined } },
    canEdit: await canEditJob(job),
    isAdmin: admin,
    items: its,
    tracks: trs.map((t) => ({ ...t, boxes: t.boxes.filter((_, i) => i % 2 === 0) })),
    assets: ass,
  }));
}

const Patch = z.object({
  shopName: z.string().trim().max(60).optional(),
  currency: z.enum(["TWD", "USD"]).optional(),
  contact: z.object({
    instagram: z.string().trim().max(40).regex(/^[A-Za-z0-9._]*$/, "IG 帳號只能有英數、點、底線").default(""),
    line: z.string().trim().max(40).default(""),
    phone: z.string().trim().max(30).regex(/^[0-9+\-\s]*$/, "電話格式不對").default(""),
  }).optional(),
});

/** 店家資料：店名與買家聯絡方式（可購買頁的下單按鈕用） */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = await guardJob((await params).id);
  if (job instanceof Response) return job;
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return apiError("欄位不對", "Invalid fields", 400);
  const set: Record<string, unknown> = {};
  if (p.data.shopName != null) set.shopName = p.data.shopName;
  if (p.data.currency) {
    // 幣別只在確認表階段改；商品各自也記幣別，一起改
    set.currency = p.data.currency;
    await (await getDb()).collection("items").updateMany({ jobId: job._id }, { $set: { currency: p.data.currency } });
  }
  if (p.data.contact) set.contact = { ...p.data.contact, instagram: p.data.contact.instagram.replace(/^@/, ""), line: p.data.contact.line.replace(/^@/, "") };
  await jobs.patch(job._id!, set);
  return Response.json({ ok: true });
}
