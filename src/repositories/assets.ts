import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { AssetSchema, type Asset } from "@/models/asset";

const col = async () => (await getDb()).collection<Asset>("assets");

export const assets = {
  async upsert(itemId: ObjectId, jobId: ObjectId, set: Partial<Asset>) {
    const now = new Date();
    const base = AssetSchema.parse({ itemId, jobId, createdAt: now, updatedAt: now });
    await (await col()).updateOne(
      { itemId },
      { $set: { ...set, updatedAt: now }, $setOnInsert: { ...Object.fromEntries(Object.entries(base).filter(([k]) => !(k in set) && k !== "updatedAt")) } },
      { upsert: true },
    );
  },
  async forJob(jobId: ObjectId) {
    return (await col()).find({ jobId }).toArray();
  },
  async byItem(itemId: ObjectId) {
    return (await col()).findOne({ itemId });
  },
};
