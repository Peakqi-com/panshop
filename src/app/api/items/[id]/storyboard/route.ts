import { ObjectId } from "mongodb";
import { z } from "zod";
import { items } from "@/repositories/items";
import { jobs } from "@/repositories/jobs";
import { assets } from "@/repositories/assets";
import { writeStoryboard, ensureSceneImages, generateSceneImage, rewriteSceneText, MOTIONS } from "@/lib/video/storyboard";

export const maxDuration = 300;

const BLOB = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;
const Scene = z.object({
  durationSec: z.number().min(2).max(10),
  purpose: z.string().max(20),
  shot: z.string().max(20),
  imagePrompt: z.string().max(1000).default(""),
  motion: z.enum(MOTIONS),
  narration: z.string().max(200),
  subtitle: z.string().max(60),
  overlay: z.enum(["none", "headline", "price", "cta"]),
  imageUrl: z.string().regex(BLOB).optional(),
});
const Patch = z.object({ hook: z.string().max(40), music: z.string().max(40).optional(), scenes: z.array(Scene).min(2).max(8) });
const Post = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rewrite") }),
  z.object({ action: z.literal("scene-image"), sceneNo: z.number().int(), description: z.string().max(500) }),
  z.object({ action: z.literal("scene-text"), sceneNo: z.number().int(), hint: z.string().max(200).default("") }),
  z.object({ action: z.literal("add-image"), url: z.string().regex(BLOB) }),
]);

async function load(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const it = await items.byId(id);
  if (!it?._id) return null;
  const [job, a] = await Promise.all([jobs.byId(it.jobId), assets.byItem(it._id)]);
  return job?._id && a ? { it, job, a } : null;
}

/** 存使用者改過的分鏡（不重新合成，合成走 regenerate-video） */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load((await params).id);
  if (!ctx) return Response.json({ error: "還沒有產出資料" }, { status: 404 });
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: `欄位不對：${p.error.issues[0]?.message ?? ""}` }, { status: 400 });
  const prev = ctx.a.storyboard;
  const storyboard = { ...prev, cta: prev?.cta ?? `留言 ${ctx.it.code} 取得連結`, hook: p.data.hook, music: p.data.music ?? prev?.music, scenes: p.data.scenes.map((s, i) => ({ ...s, sceneNo: i + 1 })) };
  await assets.upsert(ctx.it._id!, ctx.job._id!, { storyboard });
  return Response.json({ ok: true, storyboard });
}

/** 重寫整份分鏡，或替單一場產生新文字或新畫面。單場結果回給面板，由使用者決定要不要存 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load((await params).id);
  if (!ctx) return Response.json({ error: "還沒有產出資料" }, { status: 404 });
  const { it, job, a } = ctx;
  const p = Post.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "欄位不對" }, { status: 400 });
  const gallery = a.storyboard?.gallery ?? [];
  try {
    if (p.data.action === "rewrite") {
      const w = await writeStoryboard(job, it, a);
      const { scenes, usd } = await ensureSceneImages(job, it, a, w.sb, (m) => console.log(`[${job.code}][storyboard] ${m}`));
      const storyboard = { ...a.storyboard, hook: w.sb.hook, cta: `留言 ${it.code} 取得連結`, scenes };
      await assets.upsert(it._id!, job._id!, { storyboard });
      await jobs.addCost(job._id!, w.usd + usd);
      return Response.json({ ok: true, storyboard });
    }
    if (!a.storyboard) return Response.json({ error: "還沒有分鏡" }, { status: 409 });
    const keep = (url: string) => assets.upsert(it._id!, job._id!, { storyboard: { ...a.storyboard!, gallery: [url, ...gallery.filter((u) => u !== url)].slice(0, 24) } });
    if (p.data.action === "add-image") {
      await keep(p.data.url);
      return Response.json({ ok: true });
    }
    if (p.data.action === "scene-image") {
      const r = await generateSceneImage(job, it, a, p.data.sceneNo, p.data.description);
      await keep(r.url);
      await jobs.addCost(job._id!, r.usd);
      return Response.json({ ok: true, imageUrl: r.url });
    }
    const { data, usd } = await rewriteSceneText(job, it, a, a.storyboard, p.data.sceneNo, p.data.hint);
    await jobs.addCost(job._id!, usd);
    return Response.json({ ok: true, narration: data.narration, subtitle: data.subtitle, imagePrompt: data.imagePrompt });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message.slice(0, 300) : String(e) }, { status: 500 });
  }
}
