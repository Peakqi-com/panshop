import { items } from "@/repositories/items";
import { guardItem } from "@/lib/owner";
import { apiError } from "@/lib/api-error";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guardItem(id);
  if (g instanceof Response) return g;
  try {
    const r = await items.patch(id, await req.json(), "user");
    return Response.json({ ok: !!r });
  } catch (e) {
    console.warn("item patch 失敗", e instanceof Error ? e.message : String(e));
    return apiError("欄位不對", "Invalid fields", 400);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guardItem(id);
  if (g instanceof Response) return g;
  await items.patch(id, { status: "deleted" }, "user");
  return Response.json({ ok: true });
}
