import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { ItemSchema, ItemPatchSchema, type Item } from "@/models/item";

const col = async () => (await getDb()).collection<Item>("items");

export const items = {
  async replaceForJob(jobId: ObjectId, docs: Omit<Item, "_id" | "createdAt" | "updatedAt">[]) {
    const c = await col();
    await c.deleteMany({ jobId });
    if (!docs.length) return [] as Item[];
    const now = new Date();
    const parsed = docs.map((d) => ItemSchema.parse({ ...d, createdAt: now, updatedAt: now }));
    const r = await c.insertMany(parsed);
    return parsed.map((d, i) => ({ ...d, _id: r.insertedIds[i] }));
  },
  async forJob(jobId: ObjectId, opts: { includeDeleted?: boolean } = {}) {
    const q: Record<string, unknown> = { jobId };
    if (!opts.includeDeleted) q.status = { $ne: "deleted" };
    return (await col()).find(q).sort({ code: 1 }).toArray();
  },
  async byId(id: string | ObjectId) {
    return (await col()).findOne({ _id: new ObjectId(id) });
  },
  async byCode(jobId: ObjectId, code: string) {
    return (await col()).findOne({ jobId, code: code.toUpperCase() });
  },
  async patch(id: string | ObjectId, raw: unknown, by: "user" | "system" = "system") {
    const patch = ItemPatchSchema.parse(raw);
    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() };
    if (by === "user") for (const k of Object.keys(patch)) set[`userEdited.${k}`] = true;
    return (await col()).findOneAndUpdate({ _id: new ObjectId(id) }, { $set: set }, { returnDocument: "after" });
  },
  async setFields(id: ObjectId, set: Record<string, unknown>) {
    await (await col()).updateOne({ _id: id }, { $set: { ...set, updatedAt: new Date() } });
  },
  async confirmAll(jobId: ObjectId) {
    await (await col()).updateMany({ jobId, status: "draft" }, { $set: { status: "confirmed", updatedAt: new Date() } });
  },
};
