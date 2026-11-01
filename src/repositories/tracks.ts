import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { TrackSchema, type Track } from "@/models/track";

const col = async () => (await getDb()).collection<Track>("tracks");

export const tracks = {
  async replaceForJob(jobId: ObjectId, docs: Omit<Track, "_id" | "createdAt">[]) {
    const c = await col();
    await c.deleteMany({ jobId });
    if (!docs.length) return [] as Track[];
    const now = new Date();
    const parsed = docs.map((d) => TrackSchema.parse({ ...d, createdAt: now }));
    const r = await c.insertMany(parsed);
    return parsed.map((d, i) => ({ ...d, _id: r.insertedIds[i] }));
  },
  async forJob(jobId: ObjectId) {
    return (await col()).find({ jobId }).sort({ category: 1, startSec: 1 }).toArray();
  },
  async patch(id: ObjectId, set: Partial<Track>) {
    await (await col()).updateOne({ _id: id }, { $set: set });
  },
};
