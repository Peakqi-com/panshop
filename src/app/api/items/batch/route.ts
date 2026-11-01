import { ObjectId } from "mongodb";
import { z } from "zod";
import { items } from "@/repositories/items";

const Body = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(["delete", "restore", "price", "category"]),
  price: z.number().nonnegative().nullable().optional(),
  category: z.string().max(50).optional(),
});

/** 確認表的批次動作 */
export async function POST(req: Request) {
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return Response.json({ error: "參數不對" }, { status: 400 });
  let n = 0;
  for (const id of b.data.ids) {
    if (!ObjectId.isValid(id)) continue;
    const patch = b.data.action === "delete" ? { status: "deleted" as const } : b.data.action === "restore" ? { status: "draft" as const } : b.data.action === "price" ? { price: b.data.price ?? null } : { category: b.data.category ?? "" };
    await items.patch(id, patch, "user"); n++;
  }
  return Response.json({ ok: true, n });
}
