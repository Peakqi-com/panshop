import { items } from "@/repositories/items";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const r = await items.patch(id, await req.json(), "user");
    return Response.json({ ok: !!r });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await items.patch(id, { status: "deleted" }, "user");
  return Response.json({ ok: true });
}
